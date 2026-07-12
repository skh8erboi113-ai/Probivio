import sgMail from '@sendgrid/mail';

import { loadConfig } from '../config/config.js';
import { ExternalApiError, InternalError } from '../errors/app-errors.js';

import { CircuitBreaker } from './circuit-breaker.js';
import { RetryPredicates, retryWithBackoff } from './retry.js';

import type { Logger } from '@listinglogic/logger';

export interface EmailResult {
  readonly messageId: string | undefined;
  readonly statusCode: number;
}

export class SendGridService {
  private readonly enabled: boolean;
  private readonly fromEmail: string | null;
  private readonly circuit: CircuitBreaker;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'sendgrid' });
    this.enabled = config.integrations.sendgrid.enabled;

    this.circuit = new CircuitBreaker({
      serviceName: 'sendgrid',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenRequests: 1,
      logger: this.logger,
    });

    if (this.enabled && config.integrations.sendgrid.apiKey && config.integrations.sendgrid.fromEmail) {
      sgMail.setApiKey(config.integrations.sendgrid.apiKey);
      this.fromEmail = config.integrations.sendgrid.fromEmail;
      this.logger.info('SendGrid initialized');
    } else {
      this.fromEmail = null;
      this.logger.warn('SendGrid disabled — missing credentials');
    }
  }

  public isEnabled(): boolean {
    return this.enabled && this.fromEmail !== null;
  }

  public sendEmail(input: {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html?: string;
  }): Promise<EmailResult> {
    if (!this.fromEmail) throw new InternalError('SendGrid not configured', undefined, true);
    if (input.subject.length > 200) throw new InternalError('Subject too long', undefined, true);
    if (input.text.length > 100_000) throw new InternalError('Email body too long', undefined, true);

    const fromEmail = this.fromEmail;

    return this.circuit.execute(() =>
      retryWithBackoff(
        async () => {
          try {
            const [response] = await sgMail.send({
              to: input.to,
              from: fromEmail,
              subject: input.subject,
              text: input.text,
              ...(input.html && { html: input.html }),
              trackingSettings: {
                clickTracking: { enable: true },
                openTracking: { enable: true },
              },
            });

            const headers = response.headers as Record<string, string | undefined>;
            const messageId = headers['x-message-id'];

            this.logger.info('Email sent', {
              statusCode: response.statusCode,
              messageId,
              to: this.maskEmail(input.to),
            });

            return {
              statusCode: response.statusCode,
              messageId,
            };
          } catch (err) {
            throw new ExternalApiError('sendgrid', err);
          }
        },
        {
          maxAttempts: 3,
          initialDelayMs: 300,
          isRetryable: RetryPredicates.networkOrServerError,
          logger: this.logger,
          operationName: 'sendgrid.sendEmail',
        },
      ),
    );
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    const maskedLocal = local.length <= 2 ? '**' : `${local[0]}***${local.slice(-1)}`;
    return `${maskedLocal}@${domain}`;
  }
}

export function createSendGridService(logger: Logger): SendGridService {
  return new SendGridService(logger);
}
