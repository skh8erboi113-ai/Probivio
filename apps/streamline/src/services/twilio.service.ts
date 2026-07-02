import type { Logger } from '@listinglogic/logger';
import twilio, { type Twilio } from 'twilio';

import { loadConfig } from '../config/config.js';
import { ExternalApiError, InternalError } from '../errors/app-errors.js';

import { CircuitBreaker } from './circuit-breaker.js';
import { RetryPredicates, retryWithBackoff } from './retry.js';

export interface SmsResult {
  readonly sid: string;
  readonly status: string;
  readonly to: string;
}

export class TwilioService {
  private readonly client: Twilio | null;
  private readonly fromNumber: string | null;
  private readonly enabled: boolean;
  private readonly circuit: CircuitBreaker;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'twilio' });
    this.enabled = config.integrations.twilio.enabled;

    this.circuit = new CircuitBreaker({
      serviceName: 'twilio',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenRequests: 1,
      logger: this.logger,
    });

    if (
      this.enabled &&
      config.integrations.twilio.accountSid &&
      config.integrations.twilio.authToken &&
      config.integrations.twilio.fromNumber
    ) {
      this.client = twilio(config.integrations.twilio.accountSid, config.integrations.twilio.authToken);
      this.fromNumber = config.integrations.twilio.fromNumber;
      this.logger.info('Twilio initialized');
    } else {
      this.client = null;
      this.fromNumber = null;
      this.logger.warn('Twilio disabled — missing credentials');
    }
  }

  public isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  public async sendSms(to: string, body: string): Promise<SmsResult> {
    if (!this.client || !this.fromNumber) {
      throw new InternalError('Twilio not configured', undefined, true);
    }
    if (!/^\+\d{10,15}$/.test(to)) {
      throw new InternalError(`Invalid destination phone: ${to}`, undefined, true);
    }
    if (body.length > 1600) {
      throw new InternalError('SMS body exceeds 1600 chars', undefined, true);
    }

    return this.circuit.execute(() =>
      retryWithBackoff(
        async () => {
          try {
            if (!this.client || !this.fromNumber) throw new InternalError('twilio not ready', undefined, true);

            const message = await this.client.messages.create({
              to,
              from: this.fromNumber,
              body,
            });

            this.logger.info('SMS sent', {
              sid: message.sid,
              status: message.status,
              to: this.maskPhone(to),
            });

            return { sid: message.sid, status: message.status, to };
          } catch (err) {
            throw new ExternalApiError('twilio', err);
          }
        },
        {
          maxAttempts: 3,
          initialDelayMs: 300,
          isRetryable: RetryPredicates.networkOrServerError,
          logger: this.logger,
          operationName: 'twilio.sendSms',
        },
      ),
    );
  }

  private maskPhone(phone: string): string {
    if (phone.length < 8) return '***';
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }
}

export function createTwilioService(logger: Logger): TwilioService {
  return new TwilioService(logger);
}
