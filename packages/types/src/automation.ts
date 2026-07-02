import type {
  AuditFields,
  AutomationId,
  IsoTimestamp,
  OperatorScoped,
} from './common.js';
import type { LeadStatus } from './lead.js';

export const AutomationTrigger = {
  LEAD_CREATED: 'lead_created',
  LEAD_STATUS_CHANGED: 'lead_status_changed',
  LEAD_SCORED: 'lead_scored',
  SCORE_ABOVE_THRESHOLD: 'score_above_threshold',
  NO_CONTACT_FOR_DAYS: 'no_contact_for_days',
  TAG_ADDED: 'tag_added',
  MANUAL: 'manual',
  SCHEDULED: 'scheduled',
} as const;
export type AutomationTrigger = (typeof AutomationTrigger)[keyof typeof AutomationTrigger];

export const ActionType = {
  SEND_SMS: 'send_sms',
  SEND_EMAIL: 'send_email',
  SEND_TELEGRAM: 'send_telegram',
  ADD_TAG: 'add_tag',
  REMOVE_TAG: 'remove_tag',
  CHANGE_STATUS: 'change_status',
  ASSIGN_TO: 'assign_to',
  CREATE_TASK: 'create_task',
  WEBHOOK: 'webhook',
  WAIT: 'wait',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

// ─── Trigger conditions (discriminated union) ─────────────────────────────
export type TriggerConditions =
  | { readonly type: 'lead_created'; readonly source?: string }
  | { readonly type: 'lead_status_changed'; readonly fromStatus?: LeadStatus; readonly toStatus: LeadStatus }
  | { readonly type: 'lead_scored' }
  | { readonly type: 'score_above_threshold'; readonly threshold: number }
  | { readonly type: 'no_contact_for_days'; readonly days: number }
  | { readonly type: 'tag_added'; readonly tag: string }
  | { readonly type: 'manual' }
  | { readonly type: 'scheduled'; readonly cron: string };

// ─── Action definitions (discriminated union) ─────────────────────────────
export interface BaseAction {
  readonly id: string;
  readonly delayMinutes: number;
}

export type AutomationAction =
  | (BaseAction & { readonly type: 'send_sms'; readonly templateId: string; readonly toField: 'phone' | 'alternatePhone' })
  | (BaseAction & { readonly type: 'send_email'; readonly templateId: string; readonly subject: string })
  | (BaseAction & { readonly type: 'send_telegram'; readonly chatId: string; readonly message: string })
  | (BaseAction & { readonly type: 'add_tag'; readonly tag: string })
  | (BaseAction & { readonly type: 'remove_tag'; readonly tag: string })
  | (BaseAction & { readonly type: 'change_status'; readonly status: LeadStatus })
  | (BaseAction & { readonly type: 'assign_to'; readonly operatorId: string })
  | (BaseAction & { readonly type: 'create_task'; readonly title: string; readonly dueInDays: number })
  | (BaseAction & { readonly type: 'webhook'; readonly url: string; readonly method: 'POST' | 'PUT' })
  | (BaseAction & { readonly type: 'wait'; readonly durationMinutes: number });

export interface Automation extends OperatorScoped, AuditFields {
  readonly id: AutomationId;
  readonly name: string;
  readonly description?: string;
  readonly trigger: AutomationTrigger;
  readonly conditions: TriggerConditions;
  readonly actions: readonly AutomationAction[];
  readonly isActive: boolean;
  readonly runCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly lastRunAt?: IsoTimestamp;
  readonly lastError?: string;
}

export type CreateAutomationInput = Omit<
  Automation,
  'id' | 'operatorId' | 'runCount' | 'successCount' | 'failureCount' | 'lastRunAt' | 'lastError' | 'createdAt' | 'updatedAt'
>;

export type UpdateAutomationInput = Partial<
  Omit<Automation, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>
>;
