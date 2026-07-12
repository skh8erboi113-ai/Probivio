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
        // Express 5 exposes `req.query` as a getter-only property, so it
        // can't be reassigned wholesale — mutate the existing object instead.
        const parsedQuery = (await schemas.query.parseAsync(req.query)) as Record<string, unknown>;
        for (const key of Object.keys(req.query)) {
          delete (req.query as Record<string, unknown>)[key];
        }
        Object.assign(req.query, parsedQuery);
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
