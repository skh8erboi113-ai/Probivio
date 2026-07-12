import { Redis } from 'ioredis';

import { getConfig } from './config.js';

import type { Logger } from '@probivio/logger';

let cached: Redis | null = null;

export function getRedis(logger?: Logger): Redis | null {
  if (cached) return cached;

  const cfg = getConfig();
  if (!cfg.infrastructure.redis.url) {
    logger?.warn('REDIS_URL not set — Redis features disabled');
    return null;
  }

  cached = new Redis(cfg.infrastructure.redis.url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 5000,
    commandTimeout: 3000,
    retryStrategy: (times) => {
      if (times > 5) {
        logger?.error('Redis max retries exceeded — giving up');
        return null;
      }
      return Math.min(times * 100, 2000);
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      return err.message.includes(targetError);
    },
  });

  cached.on('connect', () => logger?.info('Redis connected'));
  cached.on('ready', () => logger?.info('Redis ready'));
  cached.on('error', (err) => logger?.error('Redis error', { error: err.message }));
  cached.on('close', () => logger?.warn('Redis connection closed'));

  return cached;
}
