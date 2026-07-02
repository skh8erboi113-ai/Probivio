import { generateRequestId, withContext } from '@listinglogic/logger';
import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns a correlation ID to every request and sets up async context storage
 * so the logger auto-includes it in every log line.
 *
 * Accepts an inbound `X-Request-ID` header (useful for tracing across services).
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[a-zA-Z0-9_-]{1,128}$/.test(incoming) ? incoming : generateRequestId();

  req.requestId = requestId;
  req.startTime = Date.now();

  res.setHeader('x-request-id', requestId);

  withContext(
    {
      requestId,
      route: req.path,
      method: req.method,
    },
    () => next(),
  );
}
