import type {
  AuditFields,
  BuyerId,
  Cents,
  E164Phone,
  OperatorScoped,
  UsStateCode,
} from './common.js';

export const BuyerType = {
  CASH: 'cash',
  HARD_MONEY: 'hard_money',
  CONVENTIONAL: 'conventional',
  PORTFOLIO: 'portfolio',
  HYBRID: 'hybrid',
} as const;
export type BuyerType = (typeof BuyerType)[keyof typeof BuyerType];

export const BuyerStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  BLACKLISTED: 'blacklisted',
} as const;
export type BuyerStatus = (typeof BuyerStatus)[keyof typeof BuyerStatus];

export const InvestmentStrategy = {
  FIX_AND_FLIP: 'fix_and_flip',
  BUY_AND_HOLD: 'buy_and_hold',
  WHOLESALE: 'wholesale',
  BRRRR: 'brrrr',
  DEVELOPMENT: 'development',
} as const;
export type InvestmentStrategy = (typeof InvestmentStrategy)[keyof typeof InvestmentStrategy];

export interface BuyBox {
  readonly states: readonly UsStateCode[];
  readonly cities: readonly string[];
  readonly zipCodes: readonly string[];
  readonly minBeds: number;
  readonly maxBeds: number;
  readonly minBaths: number;
  readonly maxBaths: number;
  readonly minSqft: number;
  readonly maxSqft: number;
  readonly minPrice: Cents;
  readonly maxPrice: Cents;
  readonly minYearBuilt?: number;
  readonly propertyTypes: readonly string[];
  readonly strategies: readonly InvestmentStrategy[];
  readonly excludedZips: readonly string[];
}

export interface BuyerStats {
  readonly activeDeals: number;
  readonly totalDealsClosed: number;
  readonly averageCloseTime: number;         // days
  readonly totalVolume: Cents;
  readonly rejectionRate: number;             // 0-1
  readonly lastPurchaseAt?: string;
}

export interface Buyer extends OperatorScoped, AuditFields {
  readonly id: BuyerId;
  readonly firstName: string;
  readonly lastName: string;
  readonly company?: string;
  readonly email: string;
  readonly phone?: E164Phone;
  readonly type: BuyerType;
  readonly status: BuyerStatus;
  readonly buyBox: BuyBox;
  readonly closingTimeline: number;           // typical days to close
  readonly proofOfFundsVerified: boolean;
  readonly proofOfFundsAmount?: Cents;
  readonly stats: BuyerStats;
  readonly notes?: string;
  readonly tags: readonly string[];
}

export type CreateBuyerInput = Omit<
  Buyer,
  'id' | 'operatorId' | 'stats' | 'createdAt' | 'updatedAt' | 'tags'
> & {
  readonly tags?: readonly string[];
};

export type UpdateBuyerInput = Partial<
  Omit<Buyer, 'id' | 'operatorId' | 'createdAt' | 'updatedAt'>
>;

// ─── Match result ─────────────────────────────────────────────────────────
export interface BuyerMatch {
  readonly buyer: Buyer;
  readonly matchScore: number;               // 0-100
  readonly matchReasons: readonly string[];
  readonly disqualifiers: readonly string[];
  readonly estimatedAssignmentFee: Cents;
  }
