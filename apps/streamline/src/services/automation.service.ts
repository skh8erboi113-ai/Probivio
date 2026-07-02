import type { Logger } from '@listinglogic/logger';
import type {
  AutomationRepository,
  InteractionRepository,
  LeadRepository,
} from '@listinglogic/db';
import type {
  Automation,
  AutomationAction,
  AutomationTrigger,
  LeadId,
  OperatorId,
} from '@listinglogic/types';
import { InteractionOutcome, InteractionType, LeadStatus } from '@listinglogic/types';

import type { EventPublisherService } from '../realtime/event-publisher.service.js';

import type { SendGridService } from './sendgrid.service.js';
import type { TwilioService } from './twilio.service.js';

const IN_PROCESS_DELAY_LIMIT_MS = 60_000;

export class AutomationService {
  private readonly logger: Logger;

  constructor(
    private readonly automationRepo: AutomationRepository,
    private readonly leadRepo: LeadRepository,
    private readonly interactionRepo: InteractionRepository,
    private readonly twilio: TwilioService,
    private readonly sendgrid: SendGridService,
    private readonly eventPublisher: EventPublisherService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'automation' });
  }

  public async trigger(
    operatorId: OperatorId,
    triggerType: AutomationTrigger,
    context: { readonly leadId: LeadId },
  ): Promise<void> {
    const automations = await this.automationRepo.findActiveByTrigger(operatorId, triggerType);
    if (automations.length === 0) return;

    this.logger.info('Automation trigger fired', {
      triggerType,
      leadId: context.leadId,
      matchCount: automations.length,
    });

    await Promise.allSettled(
      automations.map((auto) => this.runAutomation(operatorId, auto, context.leadId)),
    );
  }

  private async runAutomation(
    operatorId: OperatorId,
    automation: Automation,
    leadId: LeadId,
  ): Promise<void> {
    try {
      for (const action of automation.actions) {
        if (action.delayMinutes > 0) {
          const delayMs = action.delayMinutes * 60_000;
          if (delayMs > IN_PROCESS_DELAY_LIMIT_MS) {
            this.logger.warn('Action delay exceeds in-process limit — skipping', {
              automationId: automation.id,
              actionId: action.id,
              delayMinutes: action.delayMinutes,
            });
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        await this.executeAction(operatorId, action, leadId);
      }

      await this.automationRepo.recordRun(operatorId, automation.id, true);

      // Real-time broadcast
      this.eventPublisher.publish('automation.triggered', operatorId, {
        automationId: automation.id,
        automationName: automation.name,
        leadId,
        success: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Automation execution failed', {
        automationId: automation.id,
        error: message,
      });
      await this.automationRepo.recordRun(operatorId, automation.id, false, message);

      this.eventPublisher.publish('automation.triggered', operatorId, {
        automationId: automation.id,
        automationName: automation.name,
        leadId,
        success: false,
        error: message,
      });
    }
  }

  private async executeAction(
    operatorId: OperatorId,
    action: AutomationAction,
    leadId: LeadId,
  ): Promise<void> {
    const lead = await this.leadRepo.findByIdOrThrow(operatorId, leadId);

    switch (action.type) {
      case 'send_sms': {
        const to = action.toField === 'alternatePhone' ? lead.contact.alternatePhone : lead.contact.phone;
        if (!to) throw new Error('Lead has no phone number');
        const body = `Hi ${lead.contact.firstName}, this is a follow-up regarding your property.`;
        const result = await this.twilio.sendSms(to, body);
        await this.interactionRepo.record(operatorId, {
          leadId,
          type: InteractionType.SMS_SENT,
          outcome: InteractionOutcome.NEUTRAL,
          metadata: { automationId: action.id, templateId: action.templateId },
          occurredAt: new Date().toISOString() as never,
          channelId: result.sid,
        });
        break;
      }

      case 'send_email': {
        if (!lead.contact.email) throw new Error('Lead has no email');
        const result = await this.sendgrid.sendEmail({
          to: lead.contact.email,
          subject: action.subject,
          text: `Hi ${lead.contact.firstName},\n\nFollow-up regarding your property.\n\nRegards.`,
        });
        await this.interactionRepo.record(operatorId, {
          leadId,
          type: InteractionType.EMAIL_SENT,
          outcome: InteractionOutcome.NEUTRAL,
          metadata: { automationId: action.id, templateId: action.templateId },
          occurredAt: new Date().toISOString() as never,
          channelId: result.messageId,
        });
        break;
      }

      case 'add_tag': {
        const tags = Array.from(new Set([...(lead.tags ?? []), action.tag]));
        await this.leadRepo.update(operatorId, leadId, { tags });
        break;
      }

      case 'remove_tag': {
        const tags = (lead.tags ?? []).filter((t) => t !== action.tag);
        await this.leadRepo.update(operatorId, leadId, { tags });
        break;
      }

      case 'change_status': {
        await this.leadRepo.update(operatorId, leadId, { status: action.status as LeadStatus });
        break;
      }

      case 'assign_to': {
        await this.leadRepo.update(operatorId, leadId, { assignedTo: action.operatorId as OperatorId });
        break;
      }

      case 'wait':
      case 'send_telegram':
      case 'create_task':
      case 'webhook': {
        this.logger.warn('Action type not yet implemented', { type: action.type });
        break;
      }

      default: {
        const _exhaustive: never = action;
        void _exhaustive;
      }
    }
  }
}

export function createAutomationService(deps: {
  readonly automationRepo: AutomationRepository;
  readonly leadRepo: LeadRepository;
  readonly interactionRepo: InteractionRepository;
  readonly twilio: TwilioService;
  readonly sendgrid: SendGridService;
  readonly eventPublisher: EventPublisherService;
  readonly logger: Logger;
}): AutomationService {
  return new AutomationService(
    deps.automationRepo,
    deps.leadRepo,
    deps.interactionRepo,
    deps.twilio,
    deps.sendgrid,
    deps.eventPublisher,
    deps.logger,
  );
        }
