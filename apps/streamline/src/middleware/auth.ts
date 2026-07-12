import { updateContext } from '@listinglogic/logger';
import { getAuth } from 'firebase-admin/auth';

import { getLogger } from '../config/logger.js';
import { UnauthorizedError } from '../errors/app-errors.js';

import type { OperatorId } from '@listinglogic/types';
import type { NextFunction, Request, Response } from 'express';



/**
 * Firebase ID Token verification.
 *
 * Extracts and verifies the Bearer token, then populates:
 *   - req.uid          — Firebase UID
 *   - req.operatorId   — Same as UID (branded type)
 *   - req.claims       — Custom claims (roles, subscription tier)
 *
 * Rejects expired tokens, revoked tokens, and malformed headers.
 */

const BEARER_PREFIX = 'Bearer ';

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const logger = getLogger();

  try {
    const header = req.header('authorization');

    if (!header) {
      throw new UnauthorizedError('Missing Authorization header');
    }

    if (!header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedError('Invalid Authorization header format');
    }

    const token = header.slice(BEARER_PREFIX.length).trim();

    if (token.length === 0 || token.length > 4096) {
      throw new UnauthorizedError('Invalid token length');
    }

    // Verify with revocation check (rejects tokens invalidated by password change)
    const decoded = await getAuth().verifyIdToken(token, true);

    if (!decoded.uid) {
      throw new UnauthorizedError('Token missing subject');
    }

    req.uid = decoded.uid;
    req.operatorId = decoded.uid as OperatorId;
    req.claims = decoded;

    // Enrich log context with operator ID
    updateContext({ operatorId: decoded.uid });

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return next(err);
    }

    // Firebase auth errors
    if (err && typeof err === 'object' && 'code' in err) {
      const code = String(err.code);
      logger.warn('Token verification failed', { code });

      if (code === 'auth/id-token-expired') {
        return next(new UnauthorizedError('Token expired'));
      }
      if (code === 'auth/id-token-revoked') {
        return next(new UnauthorizedError('Token revoked'));
      }
      if (code === 'auth/argument-error') {
        return next(new UnauthorizedError('Malformed token'));
      }
    }

    logger.error('Unexpected auth error', { error: err });
    return next(new UnauthorizedError('Authentication failed'));
  }
}

/**
 * Optional auth — populates req.operatorId if a valid token is present
 * but does not reject unauthenticated requests. Used for public endpoints
 * that show different data when authenticated.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith(BEARER_PREFIX)) return next();

  try {
    const token = header.slice(BEARER_PREFIX.length).trim();
    const decoded = await getAuth().verifyIdToken(token, true);
    req.uid = decoded.uid;
    req.operatorId = decoded.uid as OperatorId;
    req.claims = decoded;
    updateContext({ operatorId: decoded.uid });
  } catch {
    // Silently ignore — this is optional auth
  }
  next();
}

/**
 * Require a specific custom claim (role-based access).
 * Usage: `router.get('/admin', requireAuth, requireClaim('admin'), ...)`
 */
export function requireClaim(claim: string, expectedValue: unknown = true) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.claims[claim] !== expectedValue) {
      return next(new UnauthorizedError(`Requires claim: ${claim}`));
    }
    next();
  };
}
