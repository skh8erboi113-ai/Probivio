import { EventEmitter } from 'node:events';

import { Redis } from 'ioredis';

import { getConfig } from '../config/config.js';

import type { Logger } from '@listinglogic/logger';

/**
 * Pub/sub for real-time events, broadcast to WebSocket clients.
 *
 * Two transports:
 *   - `InProcessPubSub` — in-memory EventEmitter. Correct only for a single
 *     server instance: an event published on instance A never reaches a
 *     WebSocket client connected to instance B, so on Cloud Run's default
 *     autoscaling (1 → N instances) the realtime dashboard silently goes
 *     stale for whichever operators happen to be connected to a different
 *     instance than the one that handled their write.
 *   - `RedisPubSub` — uses Redis PUBLISH/SUBSCRIBE so every instance
 *     receives every event regardless of which instance produced it.
 *     Selected automatically whenever REDIS_URL is configured; falls back
 *     to in-process otherwise (e.g. local dev without Redis running).
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
  /** Release any held connections. Safe to call even if never connected. */
  shutdown(): Promise<void>;
}

const CHANNEL_PREFIX = 'op:';

function channelFor(operatorId: string): string {
  return `${CHANNEL_PREFIX}${operatorId}`;
}

export class InProcessPubSub implements PubSubTransport {
  private readonly emitter = new EventEmitter();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'pubsub', transport: 'in-process' });
    this.emitter.setMaxListeners(1000);
  }

  public publish<T>(event: RealtimeEvent<T>): void {
    this.emitter.emit(channelFor(event.operatorId), event);
    this.logger.debug('Event published', { type: event.type, operatorId: event.operatorId });
  }

  public subscribe(operatorId: string, handler: (event: RealtimeEvent) => void): () => void {
    const channel = channelFor(operatorId);
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  // eslint-disable-next-line require-await, @typescript-eslint/require-await -- interface parity with RedisPubSub, nothing to await here
  public async shutdown(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

/**
 * Redis-backed transport. Uses two dedicated connections (never the shared
 * rate-limiting client from config/redis.ts): once a Redis connection issues
 * SUBSCRIBE it can no longer run normal commands, so publish and subscribe
 * each need their own connection.
 *
 * Fans a single Redis subscription for `op:*`-pattern channels out to
 * per-operator in-process listeners, so N WebSocket connections on this
 * instance still only cost one Redis subscription, not N.
 */
export class RedisPubSub implements PubSubTransport {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly localEmitter = new EventEmitter();
  private readonly logger: Logger;
  private patternSubscribed = false;

  constructor(redisUrl: string, logger: Logger) {
    this.logger = logger.child({ component: 'pubsub', transport: 'redis' });
    this.localEmitter.setMaxListeners(1000);

    const connectionOptions = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 5000,
      retryStrategy: (times: number): number | null => {
        if (times > 10) {
          this.logger.error('Redis pub/sub max retries exceeded — giving up');
          return null;
        }
        return Math.min(times * 200, 3000);
      },
    };

    this.publisher = new Redis(redisUrl, connectionOptions);
    this.subscriber = new Redis(redisUrl, connectionOptions);

    this.publisher.on('error', (err) => this.logger.error('Redis publisher error', { error: err.message }));
    this.subscriber.on('error', (err) => this.logger.error('Redis subscriber error', { error: err.message }));
    this.publisher.on('connect', () => this.logger.info('Redis pub/sub publisher connected'));
    this.subscriber.on('connect', () => this.logger.info('Redis pub/sub subscriber connected'));

    this.ensurePatternSubscription();
  }

  public publish<T>(event: RealtimeEvent<T>): void {
    const channel = channelFor(event.operatorId);
    void this.publisher.publish(channel, JSON.stringify(event)).catch((err: unknown) => {
      this.logger.warn('Redis publish failed', {
        type: event.type,
        operatorId: event.operatorId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  public subscribe(operatorId: string, handler: (event: RealtimeEvent) => void): () => void {
    const channel = channelFor(operatorId);
    this.localEmitter.on(channel, handler);
    return () => this.localEmitter.off(channel, handler);
  }

  public async shutdown(): Promise<void> {
    this.localEmitter.removeAllListeners();
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
  }

  /**
   * One PSUBSCRIBE for the whole `op:*` namespace, fanned out locally — this
   * keeps Redis subscription count constant regardless of how many operators
   * have active WebSocket connections to this instance.
   */
  private ensurePatternSubscription(): void {
    if (this.patternSubscribed) return;
    this.patternSubscribed = true;

    void this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`, (err) => {
      if (err) this.logger.error('Redis psubscribe failed', { error: err.message });
    });

    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const event = JSON.parse(message) as RealtimeEvent;
        this.localEmitter.emit(channel, event);
      } catch (err) {
        this.logger.warn('Failed to parse Redis pub/sub message', {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

let cached: PubSubTransport | null = null;

export function getPubSub(logger: Logger): PubSubTransport {
  if (cached) return cached;

  const config = getConfig();
  cached = config.infrastructure.redis.url
    ? new RedisPubSub(config.infrastructure.redis.url, logger)
    : new InProcessPubSub(logger);

  return cached;
}

/**
 * Test-only: allows resetting the cached transport between test runs.
 */
export function _resetPubSubForTests(): void {
  cached = null;
}
