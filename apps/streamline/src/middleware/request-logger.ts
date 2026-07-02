import type { NextFunction, Request, Response } from 'express';

import { getLogger } from '../config/logger.js';

/**
 * Structured request/response logger.
 * Logs every completed request with method, path, status, latency.
 *
 * Registered AFTER the request-context middleware so requestId is available.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const logger = getLogger();

  res.on('finish', () => {
    const latencyMs = Date.now() - req.startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger.log(level, 'HTTP request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs,
      contentLength: res.getHeader('content-length'),
      userAgent: req.header('user-agent'),
      ip: req.ip,
    });
  });

  next();
}
