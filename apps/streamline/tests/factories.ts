import type { Buyer, Lead, ProbateCase } from '@listinglogic/types';

export const operatorId = 'op_test' as const;

/**
 * Matches the operator ID the mocked `firebase-admin/auth` (tests/setup.ts)
 * always returns for any bearer token, regardless of value.
 */
export const TEST_OPERATOR_ID = operatorId;

/** Authorization header accepted by the mocked Firebase auth in every test run. */
export const makeAuthHeader = (): { readonly Authorization: string } => ({
  Authorization: 'Bearer op_test',
});

export const makeCreateLeadInput = (overrides?: Record<string, unknown>): Record<string, unknown> => ({
  contact: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+15551234567',
  },
  property: {
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
  },
  metrics: {
    estimatedValue: 200000,
    askingPrice: 150000,
    arv: 240000,
    repairEstimate: 20000,
  },
  source: 'probate',
  status: 'new',
  motivation: 'high',
  tags: [],
  ...overrides,
});

export const makeCreateBuyerInput = (overrides?: Record<string, unknown>): Record<string, unknown> => ({
  firstName: 'Bob',
  lastName: 'Smith',
  email: 'bob@acme.com',
  type: 'cash',
  status: 'active',
  buyBox: {
    states: ['TX'],
    cities: ['Austin'],
    zipCodes: [],
    minBeds: 2,
    maxBeds: 5,
    minBaths: 1,
    maxBaths: 4,
    minSqft: 1000,
    maxSqft: 4000,
    minPrice: 5_000_000,
    maxPrice: 50_000_000,
    propertyTypes: ['Single Family'],
    strategies: ['fix_and_flip'],
    excludedZips: [],
  },
  closingTimeline: 14,
  proofOfFundsVerified: true,
  tags: [],
  ...overrides,
});

export const makeLead = (overrides?: Partial<Lead>): Lead =>
  ({
    id: 'lead_1' as any,
    operatorId: operatorId as any,
    createdAt: new Date().toISOString() as any,
    updatedAt: new Date().toISOString() as any,

    contact: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+15551234567' as any,
      alternatePhone: undefined,
    },

    property: {
      address: '123 Main St',
      city: 'Austin',
      state: 'TX' as any,
      zip: '78701' as any,
      county: 'Travis',
      beds: 3,
      baths: 2,
      sqft: 1800,
      yearBuilt: 1985,
      lotSize: 0,
      propertyType: 'single_family',
      condition: 'light_rehab' as any,
    },

    metrics: {
      estimatedValue: 2_000_000 as any,
      askingPrice: 1_500_000 as any,
      arv: 2_400_000 as any,
      repairEstimate: 200_000 as any,
      assignmentFee: 600_000 as any,
      maxOffer: 500_000 as any,
    },

    source: 'probate' as any,
    status: 'new' as any,
    motivation: 'high' as any,
    score: undefined,
    scoreConfidence: undefined,
    scoreExplanation: undefined,
    scoredAt: undefined,

    notes: 'seed',
    tags: [],
    assignedTo: operatorId as any,
    lastContactedAt: undefined,
    nextFollowUpAt: undefined,
    probateCaseId: undefined,

    ...overrides,
  }) as Lead;

export const makeBuyer = (overrides?: Partial<Buyer>): Buyer =>
  ({
    id: 'buyer_1' as any,
    operatorId: operatorId as any,
    createdAt: new Date().toISOString() as any,
    updatedAt: new Date().toISOString() as any,

    firstName: 'Bob',
    lastName: 'Smith',
    company: 'Acme',
    email: 'bob@acme.com',
    phone: '+15557654321' as any,
    type: 'cash' as any,
    status: 'active' as any,

    buyBox: {
      states: ['TX'] as any,
      cities: [] as any,
      zipCodes: [] as any,
      minBeds: 0,
      maxBeds: 10,
      minBaths: 0,
      maxBaths: 10,
      minSqft: 0,
      maxSqft: 999999,
      minPrice: 0 as any,
      maxPrice: 3_000_000 as any,
      minYearBuilt: undefined,
      propertyTypes: ['single_family'],
      strategies: ['fix_and_flip'] as any,
      excludedZips: [] as any,
    },

    closingTimeline: 10,
    proofOfFundsVerified: true,
    proofOfFundsAmount: 1_000_000 as any,

    stats: {
      activeDeals: 1,
      totalDealsClosed: 25,
      averageCloseTime: 14,
      totalVolume: 0 as any,
      rejectionRate: 0.1,
      lastPurchaseAt: new Date().toISOString(),
    },

    notes: 'seed',
    tags: [],
    ...overrides,
  }) as Buyer;

export const makeProbateCase = (overrides?: Partial<ProbateCase>): ProbateCase =>
  ({
    id: 'case_1' as any,
    operatorId: operatorId as any,
    createdAt: new Date().toISOString() as any,
    updatedAt: new Date().toISOString() as any,

    caseNumber: '2026-0001',
    county: 'Travis',
    state: 'TX' as any,
    courtName: 'Travis County Court',
    filedAt: new Date().toISOString() as any,
    status: 'filed' as any,

    decedent: {
      fullName: 'John Doe',
      dateOfDeath: new Date().toISOString() as any,
      lastKnownAddress: 'somewhere',
      age: 70,
    },

    executors: [],
    assets: [],
    estimatedEstateValue: 0,
    sourceDocumentUrl: undefined,
    extractionConfidence: 0.8,
    rawExtractedText: undefined,
    convertedToLeadId: undefined,
    reviewedAt: undefined,

    ...overrides,
  }) as ProbateCase;
