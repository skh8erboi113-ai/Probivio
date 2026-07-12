import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

import { createApp } from '../../src/app.js';
import { createBuyerRouter } from '../../src/routes/buyer.routes.js';
import { makeAuthHeader, makeBuyer, TEST_OPERATOR_ID } from '../factories.js';

// ─── Helpers ─────────────────────────────────────────────────────────────
function makeCreateBuyerInput() {
  return {
    firstName: 'John',
    lastName: 'Cash',
    email: 'john@cashinvestments.com',
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
  };
}

const mockBuyer = makeBuyer();

const mockBuyerRepo = {
  listWithFilters: vi.fn().mockResolvedValue({
    items: [mockBuyer],
    total: 1,
    hasMore: false,
  }),
  findByIdOrThrow: vi.fn().mockResolvedValue(mockBuyer),
  create: vi.fn().mockResolvedValue(mockBuyer),
  update: vi.fn().mockResolvedValue(mockBuyer),
  delete: vi.fn().mockResolvedValue(undefined),
};

const mockBuyerMatchingService = {
  match: vi.fn().mockResolvedValue([
    {
      buyer: mockBuyer,
      matchScore: 85,
      matchReasons: ['Cash buyer', 'Verified POF'],
      disqualifiers: [],
      estimatedAssignmentFee: 1_000_000,
    },
  ]),
};

const mockEventPublisher = {
  publish: vi.fn(),
};

function buildApp(): Application {
  return createApp({
    routers: [
      {
        path: '/api/buyers',
        router: createBuyerRouter({
          buyerRepo: mockBuyerRepo as never,
          buyerMatching: mockBuyerMatchingService as never,
          eventPublisher: mockEventPublisher as never,
        }),
      },
    ],
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('Buyer API — Integration', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  describe('GET /api/buyers', () => {
    it('returns 200 with paginated list', async () => {
      const res = await request(app).get('/api/buyers').set(makeAuthHeader());
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('filters by type', async () => {
      await request(app)
        .get('/api/buyers?type=cash')
        .set(makeAuthHeader());

      expect(mockBuyerRepo.listWithFilters).toHaveBeenCalledWith(
        TEST_OPERATOR_ID,
        expect.objectContaining({ filters: expect.objectContaining({ type: 'cash' }) }),
      );
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/buyers');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/buyers/match', () => {
    it('returns matched buyers for a lead', async () => {
      const res = await request(app)
        .get('/api/buyers/match?leadId=lead-1')
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].matchScore).toBe(85);
      expect(res.body.data[0].matchReasons).toContain('Cash buyer');
    });

    it('returns 422 when leadId is missing', async () => {
      const res = await request(app)
        .get('/api/buyers/match')
        .set(makeAuthHeader());

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/buyers/:id', () => {
    it('returns 200 with buyer', async () => {
      const res = await request(app)
        .get(`/api/buyers/${mockBuyer.id}`)
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockBuyer.id);
    });
  });

  describe('POST /api/buyers', () => {
    it('returns 201 with created buyer', async () => {
      const res = await request(app)
        .post('/api/buyers')
        .set(makeAuthHeader())
        .send(makeCreateBuyerInput());

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Buyer created');
    });

    it('returns 422 when email is missing', async () => {
      const { email: _email, ...noEmail } = makeCreateBuyerInput();
      const res = await request(app)
        .post('/api/buyers')
        .set(makeAuthHeader())
        .send(noEmail);

      expect(res.status).toBe(422);
    });

    it('returns 422 when buyBox maxPrice < minPrice', async () => {
      const payload = {
        ...makeCreateBuyerInput(),
        buyBox: {
          ...makeCreateBuyerInput().buyBox,
          minPrice: 50_000_000,
          maxPrice: 10_000_000,
        },
      };

      const res = await request(app)
        .post('/api/buyers')
        .set(makeAuthHeader())
        .send(payload);

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /api/buyers/:id', () => {
    it('returns 200 on update', async () => {
      const res = await request(app)
        .patch(`/api/buyers/${mockBuyer.id}`)
        .set(makeAuthHeader())
        .send({ closingTimeline: 7 });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/buyers/:id', () => {
    it('returns 204 on success', async () => {
      const res = await request(app)
        .delete(`/api/buyers/${mockBuyer.id}`)
        .set(makeAuthHeader());

      expect(res.status).toBe(204);
    });
  });
});
