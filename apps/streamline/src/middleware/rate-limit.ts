import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { Redis } from 'ioredis';
import { RedisStore } from 'rate-limit-redis';

import { loadConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';

import type { NextFunction, Request, Response } from 'express';

/**
 * Rate limiting with Redis-backed sliding window (multi-instance safe).
 * Falls back to in-memory when Redis is not configured.
 *
 * Tiered limits:
 *   - global:  60 req / minute per IP  (baseline DoS protection)
 *   - auth:    10 req / minute per IP  (prevent credential stuffing)
 *   - ai:      20 req / minute per operator (protect Gemini budget)
 *   - send:    30 req / hour per operator (TCPA compliance)
 */

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const config = loadConfig();
  if (!config.infrastructure.redis.enabled || !config.infrastructure.redis.url) return null;

  if (redis) return redis;

  const logger = getLogger();
  redis = new Redis(config.infrastructure.redis.url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    reconnectOnError: (err: Error) => {
      logger.error('Redis connection error', { error: err.message });
      return true;
    },
  });

  redis.on('connect', () => logger.info('Redis rate-limiter connected'));
  redis.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));

  return redis;
}

function createLimiter(overrides: Partial<Options>): ReturnType<typeof rateLimit> {
  const redisClient = getRedis();
  const logger = getLogger();

  const base: Partial<Options> = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (req: Request, res: Response) => {
      const retryAfter = Number(res.getHeader('retry-after')) || 60;
      logger.warn('Rate limit hit', {
        ip: req.ip,
        route: req.path,
        operatorId: req.operatorId,
      });
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          details: { retryAfterSeconds: retryAfter },
        },
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      });
    },
    ...(redisClient && {
      store: new RedisStore({
        sendCommand: async (...args: string[]) => {
          const [command, ...rest] = args as [string, ...string[]];
          const result = await redisClient.call(command, rest);
          return result as boolean | number | string | (boolean | number | string)[];
        },
        prefix: 'rl:',
      }),
    }),
  };

  return rateLimit({ ...base, ...overrides });
}

// ─── Public limiters ──────────────────────────────────────────────────────
export const globalRateLimiter = createLimiter({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

export const authRateLimiter = createLimiter({
  windowMs: 60_000,
  limit: 10,
  keyGenerator: (req) => `auth:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  skipSuccessfulRequests: true,
});

export const aiRateLimiter = createLimiter({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => `ai:${req.operatorId ?? ipKeyGenerator(req.ip ?? 'unknown')}`,
});

export const sendRateLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `send:${req.operatorId ?? ipKeyGenerator(req.ip ?? 'unknown')}`,
});

/**
 * Graceful shutdown.
 */
export async function shutdownRateLimit(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

/**
 * Health check for the rate-limit Redis connection.
 */
export async function pingRateLimit(): Promise<'ok' | 'degraded' | 'disabled'> {
  const client = getRedis();
  if (!client) return 'disabled';
  try {
    await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return 'ok';
  } catch {
    return 'degraded';
  }
}

/**
 * Provide compatibility to callers who want to import all in one line.
 */
export function noopRateLimit(_req: Request, _res: Response, next: NextFunction): void {
  next();
  }
