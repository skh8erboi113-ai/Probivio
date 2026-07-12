import { ZodError } from 'zod';

import { ValidationError } from '../errors/app-errors.js';

import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';


/**
 * Zod validation middleware factory.
 * Replaces `req.body / req.query / req.params` with the parsed & transformed result.
 *
 * Usage:
 *   router.post('/leads', validate({ body: createLeadSchema }), handler);
 */

interface Schemas {
  readonly body?: ZodTypeAny;
  readonly query?: ZodTypeAny;
  readonly params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = (await schemas.body.parseAsync(req.body));
      }
      if (schemas.query) {
        // Express 5 exposes `req.query` as a getter that re-parses
        // `req.url`'s query string from scratch on every access (see
        // express/lib/request.js) — it is NOT a cached property. Mutating
        // the object returned by a previous `req.query` read (e.g. via
        // `Object.assign(req.query, ...)`) is silently discarded the next
        // time anything reads `req.query`, so route handlers kept seeing
        // the raw, un-defaulted, un-coerced query string values (e.g.
        // `sortBy` as `undefined` and `limit` as a string instead of the
        // zod-coerced number), which crashed Firestore's `.orderBy()` /
        // `.limit()` calls in production. Fix: redefine the property
        // itself (it's `configurable: true`) to a plain value, replacing
        // Express's getter so downstream code reads the parsed result.
        const parsedQuery = (await schemas.query.parseAsync(req.query)) as Record<string, unknown>;
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.') || '_root';
          details[path] = details[path] ?? [];
          details[path].push(issue.message);
        }
        return next(new ValidationError('Request validation failed', { fields: details }));
      }
      next(err);
    }
  };
}
