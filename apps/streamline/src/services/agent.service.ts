import { ConflictError as DbConflictError } from '@probivio/db';
import { LeadStatus } from '@probivio/types';
import { agentDecisionSchema } from '@probivio/validators';

import { loadConfig } from '../config/config.js';

import type { GeminiService } from './gemini.service.js';
import type { SendGridService } from './sendgrid.service.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type {
  AgentDecisionLogRepository,
  InteractionRepository,
  LeadRepository,
  OperatorAgentSettingsRepository,
} from '@probivio/db';
import type { Logger } from '@probivio/logger';
import type {
  AgentAction,
  AgentAlternative,
  AgentDecisionLog,
  AgentTrigger,
  IsoTimestamp,
  Lead,
  LeadId,
  OperatorId,
} from '@probivio/types';

/**
 * Gemini-driven automation decision engine.
 *
 * There is no rule-based trigger→action configuration anymore. Instead, every
 * event (lead created/scored/status changed, an interaction recorded, or a
 * periodic scheduled sweep) hands the full lead context to Gemini and asks it
 * a single question: "what, if anything, should happen next?"
 *
 * Gemini's answer is a JSON decision (`reasoning` + `confidence` +
 * `alternativesConsidered` + one `action` from a closed whitelist — see
 * packages/validators/automation.schema.ts). Nothing the model returns is
 * trusted or executed until it:
 *   1. Passes strict Zod validation against the action whitelist.
 *   2. Passes runtime guardrails (lead not closed/dead, per-lead daily email
 *      cap, valid status transitions).
 *   3. Clears the operator's confidence-gated autonomy threshold — see
 *      `checkAutonomy()`. Below it, the action is drafted and logged as
 *      `pendingApproval: true` instead of executed, and must be approved via
 *      `resolveApproval()` before it runs.
 *
 * Every decision — executed, blocked, pending approval, or "no_action" — is
 * written to an immutable audit log (AgentDecisionLogRepository) with
 * Gemini's reasoning, confidence, and the alternatives it rejected, so
 * operators can see exactly what the AI considered and why, not just what
 * it did.
 */

const TERMINAL_STATUSES: readonly string[] = [LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST, LeadStatus.DEAD];

export class AgentService {
  private readonly logger: Logger;

  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly interactionRepo: InteractionRepository,
    private readonly decisionLogRepo: AgentDecisionLogRepository,
    private readonly agentSettingsRepo: OperatorAgentSettingsRepository,
    private readonly gemini: GeminiService,
    private readonly sendgrid: SendGridService,
    private readonly eventPublisher: EventPublisherService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'agent' });
  }

  /**
   * Evaluate a single lead and let Gemini decide the next action.
   * Safe to call frequently — guardrails make repeated calls idempotent
   * in effect (e.g. the email cap prevents duplicate sends).
   */
  public async evaluateLead(
    operatorId: OperatorId,
    leadId: LeadId,
    trigger: AgentTrigger,
  ): Promise<AgentDecisionLog> {
    const lead = await this.leadRepo.findByIdOrThrow(operatorId, leadId);

    // Guardrail: never evaluate closed/dead leads — nothing to automate.
    if (TERMINAL_STATUSES.includes(lead.status)) {
      return this.logDecision(operatorId, leadId, trigger, {
        action: { type: 'no_action' },
        reasoning: `Lead status is terminal (${lead.status}); skipped without calling Gemini.`,
        executed: true,
      });
    }

    if (!this.gemini.isEnabled()) {
      return this.logDecision(operatorId, leadId, trigger, {
        action: { type: 'no_action' },
        reasoning: 'Gemini is not configured — automation decisions are disabled.',
        executed: false,
        blockedReason: 'gemini_disabled',
      });
    }

    const features = await this.interactionRepo.computeFeatures(operatorId, leadId);

    let decision: {
      readonly reasoning: string;
      readonly action: AgentAction;
      readonly confidence: number;
      readonly alternativesConsidered: readonly AgentAlternative[];
    };
    try {
      decision = await this.gemini.decideNextAction({
        lead,
        interactionSummary: features,
        trigger,
      });
    } catch (err) {
      this.logger.error('Gemini decision request failed', {
        leadId,
        trigger,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.logDecision(operatorId, leadId, trigger, {
        action: { type: 'no_action' },
        reasoning: 'Gemini request failed; no action taken.',
        executed: false,
        blockedReason: 'gemini_error',
      });
    }

    const guardrailResult = await this.checkGuardrails(operatorId, lead, decision.action);
    if (!guardrailResult.allowed) {
      return this.logDecision(operatorId, leadId, trigger, {
        action: decision.action,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        alternativesConsidered: decision.alternativesConsidered,
        executed: false,
        blockedReason: guardrailResult.reason,
      });
    }

    // Confidence-gated autonomy: below the operator's configured threshold
    // (or always, for send_email, if the operator requires it), draft the
    // action instead of executing it — a human must tap approve first.
    const autonomy = await this.checkAutonomy(operatorId, decision.action, decision.confidence);
    if (!autonomy.autoExecute) {
      const log = await this.logDecision(operatorId, leadId, trigger, {
        action: decision.action,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        alternativesConsidered: decision.alternativesConsidered,
        executed: false,
        pendingApproval: true,
      });

      this.eventPublisher.publish('agent.decision', operatorId, {
        leadId,
        trigger,
        action: decision.action.type,
        executed: false,
        pendingApproval: true,
      });

      this.logger.info('Agent decision drafted for approval (below autonomy threshold)', {
        leadId,
        confidence: decision.confidence,
        threshold: autonomy.threshold,
        reason: autonomy.reason,
      });

      return log;
    }

    try {
      await this.executeAction(operatorId, lead, decision.action);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Agent action execution failed', { leadId, action: decision.action.type, error: message });
      return this.logDecision(operatorId, leadId, trigger, {
        action: decision.action,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        alternativesConsidered: decision.alternativesConsidered,
        executed: false,
        blockedReason: `execution_error: ${message}`.slice(0, 500),
      });
    }

    const log = await this.logDecision(operatorId, leadId, trigger, {
      action: decision.action,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      alternativesConsidered: decision.alternativesConsidered,
      executed: true,
    });

    this.eventPublisher.publish('agent.decision', operatorId, {
      leadId,
      trigger,
      action: decision.action.type,
      executed: true,
    });

    return log;
  }

  /**
   * Approve or reject a decision that was drafted pending human sign-off
   * (confidence-gated autonomy). Approving runs the exact action Gemini
   * proposed — the operator can't edit it here, only accept or reject, so
   * the audit trail always matches what was actually executed.
   */
  public async resolveApproval(
    operatorId: OperatorId,
    decisionId: string,
    approve: boolean,
  ): Promise<AgentDecisionLog> {
    const existing = await this.decisionLogRepo.findByIdOrThrow(operatorId, decisionId);

    if (!existing.pendingApproval) {
      throw new DbConflictError(`This decision is not awaiting approval: ${decisionId}`);
    }

    if (!approve) {
      const rejected = await this.decisionLogRepo.resolveApproval(operatorId, decisionId, {
        executed: false,
        blockedReason: 'rejected_by_operator',
      });
      this.logger.info('Agent decision rejected by operator', { leadId: existing.leadId, decisionId });
      return rejected;
    }

    const lead = await this.leadRepo.findByIdOrThrow(operatorId, existing.leadId);

    try {
      await this.executeAction(operatorId, lead, existing.action);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Approved agent action failed to execute', {
        leadId: existing.leadId,
        decisionId,
        error: message,
      });
      return this.decisionLogRepo.resolveApproval(operatorId, decisionId, {
        executed: false,
        blockedReason: `execution_error: ${message}`.slice(0, 500),
      });
    }

    const resolved = await this.decisionLogRepo.resolveApproval(operatorId, decisionId, { executed: true });

    this.eventPublisher.publish('agent.decision', operatorId, {
      leadId: existing.leadId,
      trigger: existing.trigger,
      action: existing.action.type,
      executed: true,
    });

    this.logger.info('Agent decision approved and executed', { leadId: existing.leadId, decisionId });
    return resolved;
  }

  /**
   * Confidence-gated autonomy check. Operators set a per-operator
   * `autonomyThreshold` (default 75%): Gemini decisions at or above it
   * execute immediately, below it they're drafted for one-tap approval.
   * `send_email` can additionally be forced to always require approval
   * (the default) regardless of confidence, since it's the highest-stakes
   * action — a real message sent to a real person.
   */
  private async checkAutonomy(
    operatorId: OperatorId,
    action: AgentAction,
    confidence: number,
  ): Promise<{ readonly autoExecute: boolean; readonly threshold: number; readonly reason?: string }> {
    if (action.type === 'no_action') {
      // Nothing to gate — there's no real-world effect to approve.
      return { autoExecute: true, threshold: 1 };
    }

    const settings = await this.agentSettingsRepo.getCurrent(operatorId);

    if (action.type === 'send_email' && settings.requireApprovalForEmail) {
      return { autoExecute: false, threshold: settings.autonomyThreshold, reason: 'email_requires_approval' };
    }

    if (confidence < settings.autonomyThreshold) {
      return { autoExecute: false, threshold: settings.autonomyThreshold, reason: 'below_confidence_threshold' };
    }

    return { autoExecute: true, threshold: settings.autonomyThreshold };
  }

  /**
   * Guardrails enforced in code — Gemini's decision is only advisory until
   * it clears every one of these checks.
   */
  private async checkGuardrails(
    operatorId: OperatorId,
    lead: Lead,
    action: AgentAction,
  ): Promise<{ readonly allowed: true } | { readonly allowed: false; readonly reason: string }> {
    if (action.type === 'send_email') {
      if (!lead.contact.email) {
        return { allowed: false, reason: 'no_email_on_file' };
      }

      const config = loadConfig();
      const cap = config.automation.maxEmailsPerLeadPerDay;
      if (cap <= 0) {
        return { allowed: false, reason: 'email_actions_disabled' };
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() as IsoTimestamp;
      const sentToday = await this.decisionLogRepo.countExecutedEmailsSince(operatorId, lead.id, since);
      if (sentToday >= cap) {
        return { allowed: false, reason: `daily_email_cap_reached (${sentToday}/${cap})` };
      }
    }

    if (action.type === 'change_status') {
      if (TERMINAL_STATUSES.includes(action.status) && action.status !== LeadStatus.DEAD) {
        // Allow marking dead, but closing a deal is a human decision, not an AI one.
        return { allowed: false, reason: 'ai_may_not_close_deals' };
      }
    }

    return { allowed: true };
  }

  private async executeAction(operatorId: OperatorId, lead: Lead, action: AgentAction): Promise<void> {
    switch (action.type) {
      case 'send_email': {
        // Guardrail already verified lead.contact.email exists.
        await this.sendgrid.sendEmail({
          to: lead.contact.email as string,
          subject: action.subject,
          text: action.body,
        });
        break;
      }

      case 'add_tag': {
        const tags = Array.from(new Set([...(lead.tags ?? []), action.tag]));
        await this.leadRepo.update(operatorId, lead.id, { tags });
        break;
      }

      case 'remove_tag': {
        const tags = (lead.tags ?? []).filter((t) => t !== action.tag);
        await this.leadRepo.update(operatorId, lead.id, { tags });
        break;
      }

      case 'change_status': {
        await this.leadRepo.update(operatorId, lead.id, { status: action.status });
        break;
      }

      case 'schedule_follow_up': {
        const nextFollowUpAt = new Date(
          Date.now() + action.inDays * 24 * 60 * 60 * 1000,
        ).toISOString() as IsoTimestamp;
        const existingNotes = lead.notes ? `${lead.notes}\n\n` : '';
        await this.leadRepo.update(operatorId, lead.id, {
          nextFollowUpAt,
          notes: `${existingNotes}[AI follow-up] ${action.note}`.slice(0, 5000),
        });
        break;
      }

      case 'no_action': {
        break;
      }

      default: {
        const _exhaustive: never = action;
        void _exhaustive;
      }
    }
  }

  private async logDecision(
    operatorId: OperatorId,
    leadId: LeadId,
    trigger: AgentTrigger,
    input: {
      readonly action: AgentAction;
      readonly reasoning: string;
      readonly executed: boolean;
      readonly confidence?: number;
      readonly alternativesConsidered?: readonly AgentAlternative[];
      readonly blockedReason?: string;
      readonly pendingApproval?: boolean;
    },
  ): Promise<AgentDecisionLog> {
    const log = await this.decisionLogRepo.create(operatorId, {
      leadId,
      trigger,
      action: input.action,
      reasoning: input.reasoning,
      executed: input.executed,
      modelVersion: 'gemini-2.5-flash',
      ...(input.confidence !== undefined && { confidence: input.confidence }),
      ...(input.alternativesConsidered && input.alternativesConsidered.length > 0
        ? { alternativesConsidered: input.alternativesConsidered }
        : {}),
      ...(input.blockedReason && { blockedReason: input.blockedReason }),
      ...(input.pendingApproval && { pendingApproval: true }),
    });

    this.logger.info('Agent decision logged', {
      leadId,
      trigger,
      action: input.action.type,
      executed: input.executed,
      ...(input.confidence !== undefined && { confidence: input.confidence }),
      ...(input.blockedReason && { blockedReason: input.blockedReason }),
      ...(input.pendingApproval && { pendingApproval: true }),
    });

    return log;
  }

  /** Re-export for callers that only need to validate a raw Gemini response shape (tests, tooling). */
  public static readonly decisionSchema = agentDecisionSchema;
}

export function createAgentService(deps: {
  readonly leadRepo: LeadRepository;
  readonly interactionRepo: InteractionRepository;
  readonly decisionLogRepo: AgentDecisionLogRepository;
  readonly agentSettingsRepo: OperatorAgentSettingsRepository;
  readonly gemini: GeminiService;
  readonly sendgrid: SendGridService;
  readonly eventPublisher: EventPublisherService;
  readonly logger: Logger;
}): AgentService {
  return new AgentService(
    deps.leadRepo,
    deps.interactionRepo,
    deps.decisionLogRepo,
    deps.agentSettingsRepo,
    deps.gemini,
    deps.sendgrid,
    deps.eventPublisher,
    deps.logger,
  );
}
