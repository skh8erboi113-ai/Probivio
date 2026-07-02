import type { Address, BaseEntity, Cents, Contact, PersonName } from './common.js';
import type { LeadId, Score } from './branded.js';

/** Lead lifecycle status — see docs/ML_PIPELINE.md for transitions. */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'appointment_set'
  | 'under_contract'
  | 'closed_won'
  | 'closed_lost'
  | 'dead';

/** How the lead entered the pipeline. */
export type LeadSource =
  | 'probate'
  | 'direct_mail'
  | 'cold_call'
  | 'sms_blast'
  | 
