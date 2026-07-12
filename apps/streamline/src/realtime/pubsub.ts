import { EventEmitter } from 'node:events';

import type { Logger } from '@listinglogic/logger';

/**
 * In-process pub/sub for real-time events.
 *
 * For a single-instance deployment this is sufficient. When Cloud Run
 * autoscales beyond one instance, swap the transport for Redis pub/sub
 * (the interface stays the same — see RedisPubSub in next iteration).
 */

export type RealtimeEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.deleted'
  | 'lead.scored'
  | 'buyer.created'
  | 'buyer.updated'
  | 'interaction.recorded'
  | 'agent.decision';

export interface RealtimeEvent<TPayload = unknown> {
  readonly type: RealtimeEventType;
  readonly operatorId: string;
  readonly payload: TPayload;
  readonly timestamp: string;
}

export interface PubSubTransport {
  publish<T>(event: RealtimeEvent<T>): void;
  subscribe(operatorId: string, handler: (event: RealtimeEvent) => void): () => void;
}

export class InProcessPubSub implements PubSubTransport {
  private readonly emitter = new EventEmitter();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'pubsub' });
    this.emitter.setMaxListeners(1000);
  }

  public publish<T>(event: RealtimeEvent<T>): void {
    const channel = this.channelFor(event.operatorId);
    this.emitter.emit(channel, event);
    this.logger.debug('Event published', {
      type: event.type,
      operatorId: event.operatorId,
    });
  }

  public subscribe(operatorId: string, handler: (event: RealtimeEvent) => void): () => void {
    const channel = this.channelFor(operatorId);
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  private channelFor(operatorId: string): string {
    return `op:${operatorId}`;
  }
}

let cached: PubSubTransport | null = null;

export function getPubSub(logger: Logger): PubSubTransport {
  if (cached) return cached;
  cached = new InProcessPubSub(logger);
  return cached;
}
