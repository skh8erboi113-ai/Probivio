import { LeadStatus } from '@listinglogic/types';
import { agentDecisionSchema } from '@listinglogic/validators';

import { loadConfig } from '../config/config.js';

import type { GeminiService } from './gemini.service.js';
import type { SendGridService } from './sendgrid.service.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type {
  AgentDecisionLogRepository,
  InteractionRepository,
  LeadRepository,
} from '@listinglogic/db';
import type { Logger } from '@listinglogic/logger';
import type {
  AgentAction,
  AgentDecisionLog,
  AgentTrigger,
  IsoTimestamp,
  Lead,
  LeadId,
  OperatorId,
} from '@listinglogic/types';



/**
 * Gemini-driven automation decision engine.
 *
 * There is no rule-based trigger→action configuration anymore. Instead, every
 * event (lead created/scored/status changed, an interaction recorded, or a
 * periodic scheduled sweep) hands the full lead context to Gemini and asks it
 * a single question: "what, if anything, should happen next?"
 *
 * Gemini's answer is a JSON decision (`reasoning` + one `action` from a
 * closed whitelist — see packages/validators/automation.schema.ts). Nothing
 * the model returns is trusted or executed until it:
 *   1. Passes strict Zod validation against the action whitelist.
 *   2. Passes runtime guardrails (lead not closed/dead, per-lead daily email
 *      cap, valid status transitions).
 *
 * Every decision — executed, blocked, or "no_action" — is written to an
 * immutable audit log (AgentDecisionLogRepository) with Gemini's reasoning,
 * so operators can see exactly what the AI considered and why.
 */

const TERMINAL_STATUSES: readonly string[] = [LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST, LeadStatus.DEAD];

export class AgentService {
  private readonly logger: Logger;

  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly interactionRepo: InteractionRepository,
    private readonly decisionLogRepo: AgentDecisionLogRepository,
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

    let decision: { readonly reasoning: string; readonly action: AgentAction };
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
        executed: false,
        blockedReason: guardrailResult.reason,
      });
    }

    try {
      await this.executeAction(operatorId, lead, decision.action);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Agent action execution failed', { leadId, action: decision.action.type, error: message });
      return this.logDecision(operatorId, leadId, trigger, {
        action: decision.action,
        reasoning: decision.reasoning,
        executed: false,
        blockedReason: `execution_error: ${message}`.slice(0, 500),
      });
    }

    const log = await this.logDecision(operatorId, leadId, trigger, {
      action: decision.action,
      reasoning: decision.reasoning,
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
      readonly blockedReason?: string;
    },
  ): Promise<AgentDecisionLog> {
    const log = await this.decisionLogRepo.create(operatorId, {
      leadId,
      trigger,
      action: input.action,
      reasoning: input.reasoning,
      executed: input.executed,
      modelVersion: 'gemini-1.5-flash',
      ...(input.blockedReason && { blockedReason: input.blockedReason }),
    });

    this.logger.info('Agent decision logged', {
      leadId,
      trigger,
      action: input.action.type,
      executed: input.executed,
      ...(input.blockedReason && { blockedReason: input.blockedReason }),
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
  readonly gemini: GeminiService;
  readonly sendgrid: SendGridService;
  readonly eventPublisher: EventPublisherService;
  readonly logger: Logger;
}): AgentService {
  return new AgentService(
    deps.leadRepo,
    deps.interactionRepo,
    deps.decisionLogRepo,
    deps.gemini,
    deps.sendgrid,
    deps.eventPublisher,
    deps.logger,
  );
}
