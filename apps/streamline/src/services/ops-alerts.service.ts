import { loadConfig } from '../config/config.js';

import type { Logger } from '@probivio/logger';


/**
 * Operational alerting to Telegram + Discord.
 *
 * Used for high-signal events:
 *   - Circuit breaker openings
 *   - Failed retraining runs
 *   - Repeated 5xx errors
 *   - Manual "critical lead scored 95+" pings
 *
 * NEVER blocks the request path — always fire-and-forget with error suppression.
 */

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface OpsAlert {
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export class OpsAlertsService {
  private readonly logger: Logger;
  private readonly telegramBotToken: string | null;
  private readonly telegramChatId: string | null;
  private readonly discordWebhookUrl: string | null;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'ops-alerts' });

    this.telegramBotToken = config.integrations.telegram.enabled
      ? config.integrations.telegram.botToken ?? null
      : null;
    this.telegramChatId = process.env.TELEGRAM_OPS_CHAT_ID ?? null;

    this.discordWebhookUrl = config.integrations.discord.enabled
      ? config.integrations.discord.webhookUrl ?? null
      : null;
  }

  public isEnabled(): boolean {
    return Boolean(this.telegramBotToken && this.telegramChatId) || Boolean(this.discordWebhookUrl);
  }

  public dispatch(alert: OpsAlert): void {
    // Never await — alerts must not block business logic
    void this.sendAll(alert).catch((err) => {
      this.logger.warn('Ops alert dispatch failed', {
        title: alert.title,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async sendAll(alert: OpsAlert): Promise<void> {
    const promises: Promise<unknown>[] = [];

    if (this.telegramBotToken && this.telegramChatId) {
      promises.push(this.sendTelegram(alert));
    }
    if (this.discordWebhookUrl) {
      promises.push(this.sendDiscord(alert));
    }

    if (promises.length === 0) return;
    await Promise.allSettled(promises);
  }

  private async sendTelegram(alert: OpsAlert): Promise<void> {
    if (!this.telegramBotToken || !this.telegramChatId) return;

    const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    const meta = alert.metadata
      ? '\n\n' +
        Object.entries(alert.metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      : '';

    const body = {
      chat_id: this.telegramChatId,
      text: `${emoji} *${alert.title}*\n\n${alert.message}${meta}`,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };

    const res = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Telegram send failed: ${res.status}`);
    }
  }

  private async sendDiscord(alert: OpsAlert): Promise<void> {
    if (!this.discordWebhookUrl) return;

    const color =
      alert.severity === 'critical' ? 0xf06a6a : alert.severity === 'warning' ? 0xc9a84c : 0x4a9eff;

    const fields = alert.metadata
      ? Object.entries(alert.metadata).map(([name, value]) => ({
          name,
          value: String(value),
          inline: true,
        }))
      : [];

    const body = {
      embeds: [
        {
          title: alert.title,
          description: alert.message,
          color,
          timestamp: new Date().toISOString(),
          fields,
          footer: { text: 'Streamline Ops' },
        },
      ],
    };

    const res = await fetch(this.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Discord send failed: ${res.status}`);
    }
  }
}

export function createOpsAlertsService(logger: Logger): OpsAlertsService {
  return new OpsAlertsService(logger);
}
