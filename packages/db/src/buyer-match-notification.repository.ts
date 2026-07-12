import { BaseRepository } from './base.repository.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@probivio/logger';
import type { BuyerId, BuyerMatchNotification, LeadId, OperatorId } from '@probivio/types';


/**
 * Immutable log of "your buy-box matched a new lead" emails actually sent to
 * buyers. Exists purely to make BuyerNotificationService idempotent — the
 * same (buyerId, leadId) pair is only ever notified once, even if the lead
 * gets rescored multiple times while still above the buyer's threshold.
 */
export class BuyerMatchNotificationRepository extends BaseRepository<BuyerMatchNotification> {
  constructor(logger: Logger) {
    super(Collections.BUYER_MATCH_NOTIFICATIONS, 'BuyerMatchNotification', logger);
  }

  /** True if this buyer has already been notified about this lead. */
  public async alreadyNotified(operatorId: OperatorId, buyerId: BuyerId, leadId: LeadId): Promise<boolean> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.BUYER_ID, '==', buyerId)
      .where(Fields.LEAD_ID, '==', leadId)
      .limit(1)
      .get();

    return !snap.empty;
  }

  public override update(): Promise<never> {
    throw new Error('Buyer match notifications are immutable');
  }

  public override delete(): Promise<never> {
    throw new Error('Buyer match notifications are immutable');
  }
}
