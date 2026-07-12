import { BuyerStatus } from '@probivio/types';

import { BaseRepository, type ListOptions, type ListResult } from './base.repository.js';
import { Collections, Fields } from './collections.js';

import type { Logger } from '@probivio/logger';
import type {
  Buyer,
  BuyerId,
  Cents,
  Lead,
  OperatorId,
  UsStateCode,
} from '@probivio/types';

export interface BuyerFilters {
  readonly type?: string;
  readonly status?: string;
  readonly state?: UsStateCode;
  readonly search?: string;
}

export interface BuyerListOptions extends ListOptions {
  readonly filters: BuyerFilters;
}

export class BuyerRepository extends BaseRepository<Buyer> {
  constructor(logger: Logger) {
    super(Collections.BUYERS, 'Buyer', logger);
  }

  public listWithFilters(
    operatorId: OperatorId,
    options: BuyerListOptions,
  ): Promise<ListResult<Buyer>> {
    return this.list(operatorId, options, (query) => {
      let q = query;

      if (options.filters.type) q = q.where('type', '==', options.filters.type);
      if (options.filters.status) q = q.where(Fields.STATUS, '==', options.filters.status);
      if (options.filters.state) {
        q = q.where('buyBox.states', 'array-contains', options.filters.state);
      }

      return q;
    });
  }

  /**
   * Find buyers matching a lead's property profile.
   * Uses a coarse Firestore query then fine-grained scoring in memory.
   *
   * This is intentionally a two-step process because Firestore can't
   * express "min <= X <= max" across multiple ranged fields in one query.
   */
  public async findMatchingBuyers(
    operatorId: OperatorId,
    lead: Lead,
  ): Promise<readonly Buyer[]> {
    // Step 1: Coarse filter — active buyers targeting the lead's state
    const snap = await this.collection
      .where(Fields.OPERATOR_ID, '==', operatorId)
      .where(Fields.STATUS, '==', BuyerStatus.ACTIVE)
      .where('buyBox.states', 'array-contains', lead.property.state)
      .get();

    // Step 2: Fine-grained filter in memory
    return snap.docs
      .map((doc) => doc.data())
      .filter((buyer) => this.matchesBuyBox(buyer, lead));
  }

  /**
   * Update buyer stats after a deal outcome.
   * Uses FieldValue.increment for atomic counters.
   */
  public async recordDealOutcome(
    operatorId: OperatorId,
    buyerId: BuyerId,
    outcome: 'accepted' | 'rejected' | 'closed',
    dealVolume?: Cents,
  ): Promise<void> {
    const ref = this.docRef(buyerId);

    await this.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const buyer = this.assertSnapshotExists(snap, buyerId);

      if (buyer.operatorId !== operatorId) {
        throw new Error(`Cross-tenant access to buyer ${buyerId}`);
      }

      const stats = { ...buyer.stats };

      switch (outcome) {
        case 'accepted':
          break;

        case 'rejected':
          stats.rejectionRate =
            (stats.rejectionRate * stats.totalDealsClosed + 1) /
            (stats.totalDealsClosed + 1);
          break;

        case 'closed':
          stats.totalDealsClosed += 1;
          stats.activeDeals = Math.max(0, stats.activeDeals - 1);
          stats.lastPurchaseAt = new Date().toISOString();
          if (dealVolume) {
            stats.totalVolume = (stats.totalVolume + dealVolume);
          }
          break;
      }

      tx.update(ref, {
        stats,
        updatedAt: new Date().toISOString(),
      });
    });

    this.logger.info('Buyer deal outcome recorded', { buyerId, outcome });
  }

  // ─── Private matching logic ─────────────────────────────────────────────
  private matchesBuyBox(buyer: Buyer, lead: Lead): boolean {
    const box = buyer.buyBox;
    const { property, metrics } = lead;

    // Excluded ZIP check
    if (box.excludedZips.includes(property.zip)) return false;

    // City check — if buyer specifies cities, lead city must match
    if (box.cities.length > 0 && !box.cities.some((c) => c.toLowerCase() === property.city.toLowerCase())) {
      return false;
    }

    // ZIP whitelist check
    if (box.zipCodes.length > 0 && !box.zipCodes.includes(property.zip)) {
      return false;
    }

    // Bedroom range
    if (property.beds !== undefined) {
      if (property.beds < box.minBeds || property.beds > box.maxBeds) return false;
    }

    // Bathroom range
    if (property.baths !== undefined) {
      if (property.baths < box.minBaths || property.baths > box.maxBaths) return false;
    }

    // Sqft range
    if (property.sqft !== undefined) {
      if (property.sqft < box.minSqft || property.sqft > box.maxSqft) return false;
    }

    // Year built minimum
    if (box.minYearBuilt && property.yearBuilt !== undefined) {
      if (property.yearBuilt < box.minYearBuilt) return false;
    }

    // Price range (use askingPrice or estimatedValue)
    const price = metrics.askingPrice ?? metrics.estimatedValue;
    if (price !== undefined) {
      if (price < box.minPrice || price > box.maxPrice) return false;
    }

    // Property type
    if (property.propertyType && box.propertyTypes.length > 0) {
      if (!box.propertyTypes.some((t) => t.toLowerCase() === property.propertyType?.toLowerCase())) {
        return false;
      }
    }

    return true;
  }
}
