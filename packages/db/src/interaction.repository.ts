import { InteractionOutcome, InteractionType } from '@probivio/types';

import { BaseRepository } from './base.repository.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@probivio/logger';
import type {
  CreateInteractionInput,
  Interaction,
  InteractionFeatures,
  IsoTimestamp,
  LeadId,
  OperatorId,
} from '@probivio/types';

/**
 * Interactions are append-only — no updates or deletes.
 * This provides an immutable audit log for the ML feedback loop.
 */
export class InteractionRepository extends BaseRepository<Interaction> {
  constructor(logger: Logger) {
    super(Collections.INTERACTIONS, 'Interaction', logger);
  }

  /**
   * Record a new interaction. This is the primary feedback signal
   * for the scoring engine's learning loop.
   */
  public record(
    operatorId: OperatorId,
    input: CreateInteractionInput,
  ): Promise<Interaction> {
    return this.create(operatorId, {
      leadId: input.leadId,
      type: input.type,
      outcome: input.outcome,
      metadata: input.metadata,
      occurredAt: input.occurredAt,
      ...(input.durationSeconds !== undefined && { durationSeconds: input.durationSeconds }),
      ...(input.channelId !== undefined && { channelId: input.channelId }),
    });
  }

  /**
   * Fetch all interactions for a single lead, newest first.
   * Used by the lead detail view and scoring engine.
   */
  public async findByLead(
    operatorId: OperatorId,
    leadId: LeadId,
    limit = 100,
  ): Promise<readonly Interaction[]> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.LEAD_ID, '==', leadId)
      .orderBy('occurredAt', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Aggregate interaction history into ML feature vectors.
   * Called by the scoring engine before invoking Gemini.
   */
  public async computeFeatures(
    operatorId: OperatorId,
    leadId: LeadId,
  ): Promise<InteractionFeatures> {
    const interactions = await this.findByLead(operatorId, leadId, 500);

    if (interactions.length === 0) {
      return {
        totalInteractions: 0,
        positiveCount: 0,
        negativeCount: 0,
        responseRate: 0,
        avgResponseTimeMinutes: 0,
        daysSinceFirstContact: 0,
        daysSinceLastContact: 0,
        hasAppointment: false,
        hasOffer: false,
        hasContract: false,
      };
    }

    const positiveCount = interactions.filter(
      (i) => i.outcome === InteractionOutcome.POSITIVE,
    ).length;
    const negativeCount = interactions.filter(
      (i) => i.outcome === InteractionOutcome.NEGATIVE,
    ).length;

    const outbound = interactions.filter((i) =>
      [InteractionType.EMAIL_SENT, InteractionType.CALL_MADE].includes(i.type as typeof InteractionType.EMAIL_SENT),
    );
    const inbound = interactions.filter((i) =>
      [
        InteractionType.EMAIL_REPLIED,
        InteractionType.CALL_ANSWERED,
      ].includes(i.type as typeof InteractionType.EMAIL_REPLIED),
    );

    const responseRate = outbound.length > 0 ? inbound.length / outbound.length : 0;

    const avgResponseTimeMinutes = this.computeAvgResponseTime(interactions);

    const timestamps = interactions
      .map((i) => new Date(i.occurredAt).getTime())
      .sort((a, b) => a - b);
    const first = timestamps[0] ?? Date.now();
    const last = timestamps[timestamps.length - 1] ?? Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return {
      totalInteractions: interactions.length,
      positiveCount,
      negativeCount,
      responseRate: Math.min(1, responseRate),
      avgResponseTimeMinutes,
      daysSinceFirstContact: Math.floor((Date.now() - first) / dayMs),
      daysSinceLastContact: Math.floor((Date.now() - last) / dayMs),
      hasAppointment: interactions.some((i) => i.type === InteractionType.APPOINTMENT_SET),
      hasOffer: interactions.some((i) => i.type === InteractionType.OFFER_MADE),
      hasContract: interactions.some((i) => i.type === InteractionType.CONTRACT_SIGNED),
    };
  }

  /**
   * Fetch all interactions for a given operator since a timestamp.
   * Used by the ML retraining job.
   */
  public async findSince(
    operatorId: OperatorId,
    since: IsoTimestamp,
    limit = 10_000,
  ): Promise<readonly Interaction[]> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where('occurredAt', '>=', since)
      .orderBy('occurredAt', 'asc')
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Prevent updates and deletes (append-only invariant).
   */
  public override update(): Promise<never> {
    throw new Error('Interactions are append-only — updates are forbidden');
  }

  public override delete(): Promise<never> {
    throw new Error('Interactions are append-only — deletes are forbidden');
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private computeAvgResponseTime(interactions: readonly Interaction[]): number {
    const pairs: number[] = [];
    const sorted = [...interactions].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (!current || !next) continue;

      const isOutbound = [
        InteractionType.EMAIL_SENT,
        InteractionType.CALL_MADE,
      ].includes(current.type as typeof InteractionType.EMAIL_SENT);

      const isResponse = [
        InteractionType.EMAIL_REPLIED,
        InteractionType.CALL_ANSWERED,
      ].includes(next.type as typeof InteractionType.EMAIL_REPLIED);

      if (isOutbound && isResponse) {
        const diffMs =
          new Date(next.occurredAt).getTime() - new Date(current.occurredAt).getTime();
        pairs.push(diffMs / (1000 * 60));
      }
    }

    if (pairs.length === 0) return 0;
    return pairs.reduce((a, b) => a + b, 0) / pairs.length;
  }
  }
