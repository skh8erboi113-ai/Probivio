import type { BuyerRepository, LeadRepository } from '@listinglogic/db';
import type { Logger } from '@listinglogic/logger';
import type { Buyer, BuyerMatch, Cents, Lead, LeadId, OperatorId } from '@listinglogic/types';

/**
 * Matches a lead against an operator's buyer Rolodex.
 *
 * Coarse filtering (state / buy-box ranges) happens in BuyerRepository.findMatchingBuyers
 * (Firestore-level). Fine-grained scoring — assignment fee estimate, match reasons,
 * disqualifiers — happens here in memory since it's cheap once the candidate set is small.
 */
export interface BuyerMatchOptions {
  readonly limit?: number;
  readonly minMatchScore?: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_MATCH_SCORE = 60;

export class BuyerMatchingService {
  private readonly logger: Logger;

  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly buyerRepo: BuyerRepository,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'buyer-matching' });
  }

  public async match(
    operatorId: OperatorId,
    leadId: LeadId,
    options: BuyerMatchOptions = {},
  ): Promise<readonly BuyerMatch[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const minMatchScore = options.minMatchScore ?? DEFAULT_MIN_MATCH_SCORE;

    const lead = await this.leadRepo.findByIdOrThrow(operatorId, leadId);
    const candidates = await this.buyerRepo.findMatchingBuyers(operatorId, lead);

    const matches: BuyerMatch[] = candidates
      .map((buyer) => this.scoreMatch(buyer, lead))
      .filter((match) => match.matchScore >= minMatchScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    this.logger.info('Buyer match complete', {
      leadId,
      candidateCount: candidates.length,
      matchCount: matches.length,
    });

    return matches;
  }

  private scoreMatch(buyer: Buyer, lead: Lead): BuyerMatch {
    const reasons: string[] = [];
    const disqualifiers: string[] = [];
    let score = 50;

    const { property, metrics } = lead;
    const box = buyer.buyBox;

    // Strategy / closing speed signals
    if (buyer.proofOfFundsVerified) {
      score += 15;
      reasons.push('Proof of funds verified');
    } else {
      disqualifiers.push('Proof of funds not verified');
    }

    if (buyer.closingTimeline <= 14) {
      score += 10;
      reasons.push(`Fast closer (${buyer.closingTimeline}d typical)`);
    }

    if (buyer.stats.totalDealsClosed > 5) {
      score += 10;
      reasons.push(`${buyer.stats.totalDealsClosed} deals closed historically`);
    }

    if (buyer.stats.rejectionRate > 0.5) {
      score -= 15;
      disqualifiers.push('High historical rejection rate');
    }

    // Property-fit signals beyond the coarse Firestore filter
    if (property.condition && box.strategies.includes('fix_and_flip') && property.condition !== 'turnkey') {
      score += 10;
      reasons.push('Condition matches fix-and-flip strategy');
    }

    const price = metrics.askingPrice ?? metrics.estimatedValue ?? 0;
    const estimatedAssignmentFee = this.estimateAssignmentFee(price, metrics.arv);

    return {
      buyer,
      matchScore: this.clamp(score),
      matchReasons: reasons,
      disqualifiers,
      estimatedAssignmentFee,
    };
  }

  private estimateAssignmentFee(askingPrice: number, arv: number | undefined): Cents {
    // Heuristic: 5-8% of ARV (or asking price if ARV unknown), floor $2,500, cap $50,000.
    const base = arv && arv > 0 ? arv : askingPrice;
    const fee = Math.round(base * 0.06);
    return Math.min(5_000_000, Math.max(250_000, fee));
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}

export function createBuyerMatchingService(deps: {
  readonly leadRepo: LeadRepository;
  readonly buyerRepo: BuyerRepository;
  readonly logger: Logger;
}): BuyerMatchingService {
  return new BuyerMatchingService(deps.leadRepo, deps.buyerRepo, deps.logger);
}
