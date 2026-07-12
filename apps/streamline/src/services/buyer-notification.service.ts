import { DEFAULT_NOTIFICATION_THRESHOLD } from '@probivio/types';

import type { BuyerMatchingService } from './buyer-matching.service.js';
import type { SendGridService } from './sendgrid.service.js';
import type { EventPublisherService } from '../realtime/event-publisher.service.js';
import type { BuyerMatchNotificationRepository } from '@probivio/db';
import type { Logger } from '@probivio/logger';
import type { BuyerMatch, Lead, OperatorId } from '@probivio/types';

/**
 * Buyer-side matching notifications — the feature that turns this from a
 * one-sided "operator manages leads" tool into a two-sided marketplace.
 * Buyers don't have to remember to log in and check for new deals: when a
 * lead newly clears their buy-box AND deal-score threshold, they get an
 * email automatically.
 *
 * Idempotent by design: `BuyerMatchNotificationRepository.alreadyNotified`
 * guards every send, so calling this after every rescore (which can happen
 * many times as a lead's status/interactions change) never spams a buyer
 * with duplicate emails for the same lead — they're notified exactly once,
 * the first time the match clears their bar.
 */
export class BuyerNotificationService {
  private readonly logger: Logger;

  constructor(
    private readonly buyerMatching: BuyerMatchingService,
    private readonly notificationRepo: BuyerMatchNotificationRepository,
    private readonly sendgrid: SendGridService,
    private readonly eventPublisher: EventPublisherService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'buyer-notification' });
  }

  /**
   * Called after a lead is scored (created, rescored, or otherwise
   * changed). Finds buyers whose buy-box matches this lead, filters to
   * those who opted in and whose personal threshold is cleared, skips
   * anyone already notified about this exact lead, and emails the rest.
   * Never throws — a notification failure should never fail the scoring
   * request that triggered it.
   */
  public async notifyMatchingBuyers(operatorId: OperatorId, lead: Lead): Promise<void> {
    try {
      const matches = await this.buyerMatching.match(operatorId, lead.id, { minMatchScore: 0, limit: 50 });
      const eligible = matches.filter((m) => this.isEligible(m));

      if (eligible.length === 0) return;

      const results = await Promise.allSettled(eligible.map((match) => this.notifyOne(operatorId, lead, match)));

      const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
      if (sent > 0) {
        this.logger.info('Buyer match notifications sent', { leadId: lead.id, sent, eligible: eligible.length });
      }
    } catch (err) {
      this.logger.warn('Buyer match notification sweep failed', {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private isEligible(match: BuyerMatch): boolean {
    if (!match.buyer.notifyOnMatch) return false;
    const threshold = match.buyer.notificationThreshold ?? DEFAULT_NOTIFICATION_THRESHOLD;
    return match.matchScore >= threshold;
  }

  /** Returns true if an email was actually sent (false if already notified or send failed). */
  private async notifyOne(operatorId: OperatorId, lead: Lead, match: BuyerMatch): Promise<boolean> {
    const { buyer } = match;

    const already = await this.notificationRepo.alreadyNotified(operatorId, buyer.id, lead.id);
    if (already) return false;

    if (!this.sendgrid.isEnabled()) {
      this.logger.debug('SendGrid disabled — skipping buyer notification email', { buyerId: buyer.id });
      return false;
    }

    try {
      await this.sendgrid.sendEmail({
        to: buyer.email,
        subject: `New deal matches your buy-box: ${lead.property.city}, ${lead.property.state}`,
        text: this.buildEmailBody(lead, match),
      });
    } catch (err) {
      this.logger.warn('Buyer notification email failed', {
        buyerId: buyer.id,
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }

    await this.notificationRepo.create(operatorId, {
      buyerId: buyer.id,
      leadId: lead.id,
      matchScore: match.matchScore,
      sentAt: new Date().toISOString(),
    });

    this.eventPublisher.publish('buyer.updated', operatorId, {
      buyerId: buyer.id,
      changedFields: ['matchNotified'],
    });

    return true;
  }

  private buildEmailBody(lead: Lead, match: BuyerMatch): string {
    const price = lead.metrics.askingPrice ?? lead.metrics.estimatedValue;
    const lines = [
      `A new deal just cleared your buy-box (${match.matchScore}% match):`,
      '',
      `${lead.property.address}, ${lead.property.city}, ${lead.property.state} ${lead.property.zip}`,
      price ? `Asking: $${(price / 100).toLocaleString()}` : null,
      lead.metrics.arv ? `ARV: $${(lead.metrics.arv / 100).toLocaleString()}` : null,
      match.matchReasons.length > 0 ? `\nWhy it matches:\n- ${match.matchReasons.join('\n- ')}` : null,
      '\nLog in to view full details and make an offer.',
    ].filter((line): line is string => line !== null);

    return lines.join('\n');
  }
}

export function createBuyerNotificationService(deps: {
  readonly buyerMatching: BuyerMatchingService;
  readonly notificationRepo: BuyerMatchNotificationRepository;
  readonly sendgrid: SendGridService;
  readonly eventPublisher: EventPublisherService;
  readonly logger: Logger;
}): BuyerNotificationService {
  return new BuyerNotificationService(
    deps.buyerMatching,
    deps.notificationRepo,
    deps.sendgrid,
    deps.eventPublisher,
    deps.logger,
  );
}
