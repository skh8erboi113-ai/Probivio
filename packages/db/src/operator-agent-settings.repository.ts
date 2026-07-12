import { DEFAULT_AUTONOMY_THRESHOLD } from '@probivio/types';
import { type Firestore } from 'firebase-admin/firestore';

import { getDb } from './client.js';
import { Collections } from './collections.js';

import type { Logger } from '@probivio/logger';
import type { IsoTimestamp, OperatorAgentSettings, UpdateOperatorAgentSettingsInput } from '@probivio/types';

/**
 * Per-operator "confidence-gated autonomy" dial for the Gemini agent — one
 * document per operator, keyed by operator ID (same single-doc-per-operator
 * pattern as ScoringWeightsRepository). Falls back to sensible defaults
 * (75% threshold, email always requires approval) so the agent works safely
 * out of the box before an operator has ever visited the settings page.
 */
export class OperatorAgentSettingsRepository {
  private readonly db: Firestore;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.db = getDb();
    this.logger = logger.child({ repository: 'OperatorAgentSettings' });
  }

  public async getCurrent(operatorId: string): Promise<OperatorAgentSettings> {
    const snap = await this.db.collection(Collections.OPERATOR_SETTINGS).doc(operatorId).get();

    if (!snap.exists) return this.getDefaults(operatorId);

    const data = snap.data();
    if (!data) return this.getDefaults(operatorId);

    return data as OperatorAgentSettings;
  }

  public async update(
    operatorId: string,
    patch: UpdateOperatorAgentSettingsInput,
  ): Promise<OperatorAgentSettings> {
    const current = await this.getCurrent(operatorId);
    const now = new Date().toISOString() as IsoTimestamp;

    const updated: OperatorAgentSettings = {
      ...current,
      ...patch,
      id: operatorId as OperatorAgentSettings['id'],
      operatorId: operatorId as OperatorAgentSettings['operatorId'],
      updatedAt: now,
      createdAt: current.createdAt ?? now,
    };

    await this.db.collection(Collections.OPERATOR_SETTINGS).doc(operatorId).set(updated);

    this.logger.info('Operator agent settings updated', {
      operatorId,
      autonomyThreshold: updated.autonomyThreshold,
      requireApprovalForEmail: updated.requireApprovalForEmail,
    });

    return updated;
  }

  private getDefaults(operatorId: string): OperatorAgentSettings {
    const now = new Date(0).toISOString() as IsoTimestamp;
    return {
      id: operatorId as OperatorAgentSettings['id'],
      operatorId: operatorId as OperatorAgentSettings['operatorId'],
      autonomyThreshold: DEFAULT_AUTONOMY_THRESHOLD,
      requireApprovalForEmail: true,
      createdAt: now,
      updatedAt: now,
    };
  }
}
