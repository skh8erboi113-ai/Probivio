import { getPubSub, type PubSubTransport, type RealtimeEventType } from './pubsub.js';

import type { Logger } from '@listinglogic/logger';


/**
 * High-level publisher used by domain services.
 * Never blocks — publish is fire-and-forget.
 */

export class EventPublisherService {
  private readonly pubsub: PubSubTransport;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'event-publisher' });
    this.pubsub = getPubSub(this.logger);
  }

  public publish<T>(type: RealtimeEventType, operatorId: string, payload: T): void {
    try {
      this.pubsub.publish({
        type,
        operatorId,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn('Event publish failed', {
        type,
        operatorId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function createEventPublisherService(logger: Logger): EventPublisherService {
  return new EventPublisherService(logger);
}
