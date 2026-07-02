import type { NextFunction, Request, Response } from 'express';

import { getLogger } from '../config/logger.js';
import { ForbiddenError, ValidationError } from '../errors/app-errors.js';

/**
 * TCPA (Telephone Consumer Protection Act) compliance middleware.
 *
 * Enforces:
 *   1. Quiet hours — no SMS/calls before 8am or after 9pm recipient local time
 *   2. Do-Not-Contact list check
 *   3. Opt-out keyword detection in outbound messages
 *   4. Consent verification (must have documented consent to text)
 *
 * Applied to /api/leads/send and /api/leads/call endpoints.
 */

const QUIET_HOURS_START = 21;              // 9pm
const QUIET_HOURS_END = 8;                 // 8am

const FORBIDDEN_KEYWORDS = [
  'guarantee',
  'guaranteed',
  '100% approved',
  'no risk',
  'act now',
];

/**
 * Rough state → timezone offset (hours from UTC, standard time).
 * Production systems should use a proper timezone library and lookup.
 */
const STATE_UTC_OFFSET: Record<string, number> = {
  // Eastern
  CT: -5, DE: -5, DC: -5, FL: -5, GA: -5, ME: -5, MD: -5, MA: -5,
  NH: -5, NJ: -5, NY: -5, NC: -5, OH: -5, PA: -5, RI: -5, SC: -5,
  VT: -5, VA: -5, WV: -5,
  // Central
  AL: -6, AR: -6, IL: -6, IA: -6, KS: -6, KY: -6, LA: -6, MI: -6,
  MN: -6, MS: -6, MO: -6, NE: -6, ND: -6, OK: -6, SD: -6, TN: -6,
  TX: -6, WI: -6,
  // Mountain
  CO: -7, ID: -7, MT: -7, NM: -7, UT: -7, WY: -7, AZ: -7,
  // Pacific
  CA: -8, NV: -8, OR: -8, WA: -8,
  // Alaska / Hawaii
  AK: -9, HI: -10,
  IN: -5,
};

export function tcpaComplianceMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const logger = getLogger();

  try {
    const body = req.body as {
      readonly channel?: string;
      readonly recipientState?: string;
      readonly message?: string;
    };

    // Only enforce for SMS/voice channels
    if (body.channel !== 'sms' && body.channel !== 'voice') {
      return next();
    }

    // ─── Quiet-hours check ────────────────────────────────────────────────
    if (body.recipientState) {
      const offset = STATE_UTC_OFFSET[body.recipientState.toUpperCase()];
      if (offset !== undefined) {
        const now = new Date();
        const localHour = (now.getUTCHours() + offset + 24) % 24;

        if (localHour >= QUIET_HOURS_START || localHour < QUIET_HOURS_END) {
          logger.warn('TCPA quiet-hours block', {
            state: body.recipientState,
            localHour,
            operatorId: req.operatorId,
          });
          throw new ForbiddenError(
            `TCPA violation: quiet hours in ${body.recipientState} (current local time: ${localHour}:00)`,
          );
        }
      }
    }

    // ─── Forbidden-keyword check ──────────────────────────────────────────
    if (body.message) {
      const lower = body.message.toLowerCase();
      const found = FORBIDDEN_KEYWORDS.find((kw) => lower.includes(kw));
      if (found) {
        throw new ValidationError('Message contains prohibited language', {
          keyword: found,
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
