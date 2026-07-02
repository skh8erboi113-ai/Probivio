import type { Logger } from '@listinglogic/logger';
import type {
  Automation,
  AutomationId,
  AutomationTrigger,
  OperatorId,
} from '@listinglogic/types';

import { BaseRepository, type ListOptions, type ListResult } from './base.repository.js';
import { Collections, Fields } from './collections.js';

export interface AutomationFilters {
  readonly isActive?: boolean;
  readonly trigger?: AutomationTrigger;
}

export interface AutomationListOptions extends ListOptions {
  readonly filters: AutomationFilters;
}

export class AutomationRepository extends BaseRepository<Automation> {
  constructor(logger: Logger) {
    super(Collections.AUTOMATIONS, 'Automation', logger);
  }

  public async listWithFilters(
    operatorId: OperatorId,
    options: AutomationListOptions,
  ): Promise<ListResult<Automation>> {
    return this.list(operatorId, options, (query) => {
      let q = query;

      if (options.filters.isActive !== undefined) {
        q = q.where('isActive', '==', options.filters.isActive);
      }
      if (options.filters.trigger) {
        q = q.where('trigger', '==', options.filters.trigger);
      }

      return q;
    });
  }

  /**
   * Find all active automations for a given trigger type.
   * Called by the automation engine when an event fires.
   */
  public async findActiveByTrigger(
    operatorId: OperatorId,
    trigger: AutomationTrigger,
  ): Promise<readonly Automation[]> {
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where('trigger', '==', trigger)
      .where('isActive', '==', true)
      .get();

    return snap.docs.map((d) => d.data());
  }

  /**
   * Record a successful automation run.
   */
  public async recordRun(
    operatorId: OperatorId,
    automationId: AutomationId,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const ref = this.docRef(automationId);

    await this.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const automation = this.assertSnapshotExists(snap, automationId);

      if (automation.operatorId !== operatorId) {
        throw new Error(`Cross-tenant access to automation ${automationId}`);
      }

      const patch: Record<string, unknown> = {
        runCount: automation.runCount + 1,
        lastRunAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (success) {
        patch.successCount = automation.successCount + 1;
        patch.lastError = null;
      } else {
        patch.failureCount = automation.failureCount + 1;
        if (error) patch.lastError = error.slice(0, 500);
      }

      tx.update(ref, patch);
    });

    this.logger.info('Automation run recorded', { automationId, success });
  }
}
