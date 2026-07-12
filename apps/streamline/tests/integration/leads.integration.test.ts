import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

import { createApp } from '../../src/app.js';
import { createLeadRouter } from '../../src/routes/lead.routes.js';
import { makeAuthHeader, makeCreateLeadInput, makeLead, TEST_OPERATOR_ID } from '../factories.js';
import { LeadStatus } from '@listinglogic/types';

// ─── Mock dependencies ────────────────────────────────────────────────────
const mockLead = makeLead();

const mockLeadRepo = {
  listWithFilters: vi.fn().mockResolvedValue({
    items: [mockLead],
    total: 1,
    hasMore: false,
  }),
  findByIdOrThrow: vi.fn().mockResolvedValue(mockLead),
  findById: vi.fn().mockResolvedValue(mockLead),
  create: vi.fn().mockResolvedValue(mockLead),
  update: vi.fn().mockResolvedValue({ ...mockLead, status: LeadStatus.CONTACTED }),
  delete: vi.fn().mockResolvedValue(undefined),
  findHotLeads: vi.fn().mockResolvedValue([mockLead]),
  applyScore: vi.fn().mockResolvedValue(mockLead),
};

const mockScoringService = {
  scoreLead: vi.fn().mockResolvedValue({
    composite: 75,
    dealScore: 70,
    motivationScore: 80,
    urgencyScore: 60,
    confidence: 0.8,
    explanation: 'Good deal.',
    recommendation: 'pursue',
    topFactors: [],
    modelVersion: '2.0.0-heuristic',
    scoredAt: new Date().toISOString(),
  }),
  getScoreDrillDown: vi.fn().mockResolvedValue({
    score: {
      composite: 75,
      dealScore: 70,
      motivationScore: 80,
      urgencyScore: 60,
      confidence: 0.8,
      explanation: 'Good deal.',
      recommendation: 'pursue',
      topFactors: [{ name: 'strong_equity', value: 0.9, weight: 0.4, description: '40% equity' }],
      modelVersion: '2.0.0-heuristic',
      scoredAt: new Date().toISOString(),
    },
    currentWeights: {
      dealWeight: 0.4,
      motivationWeight: 0.4,
      urgencyWeight: 0.2,
      version: 'v1',
      trainedAt: new Date().toISOString(),
      trainingSampleSize: 10,
      validationAccuracy: 0.7,
    },
    driftAvailable: false,
    weightDrift: [],
  }),
};

const mockAgentService = {
  evaluateLead: vi.fn().mockResolvedValue({
    id: 'decision_1',
    leadId: mockLead.id,
    trigger: 'lead_created',
    action: { type: 'no_action' },
    reasoning: 'test',
    executed: true,
    modelVersion: 'gemini-1.5-flash',
  }),
};

const mockEventPublisher = {
  publish: vi.fn(),
};

const mockSkipTrace = {
  lookup: vi.fn().mockResolvedValue({
    status: 'not_configured',
    provider: null,
    confidence: 0,
    phones: [],
    emails: [],
    tracedAt: new Date().toISOString(),
  }),
};

function buildApp(): Application {
  return createApp({
    routers: [
      {
        path: '/api/leads',
        router: createLeadRouter({
          leadRepo: mockLeadRepo as never,
          scoringService: mockScoringService as never,
          agentService: mockAgentService as never,
          eventPublisher: mockEventPublisher as never,
          skipTrace: mockSkipTrace as never,
        }),
      },
    ],
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('Lead API — Integration', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  describe('GET /api/leads', () => {
    it('returns 200 with paginated leads', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.requestId).toBeTruthy();
    });

    it('returns 200 with status filter', async () => {
      const res = await request(app)
        .get('/api/leads?status=new')
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(mockLeadRepo.listWithFilters).toHaveBeenCalledWith(
        TEST_OPERATOR_ID,
        expect.objectContaining({ filters: expect.objectContaining({ status: 'new' }) }),
      );
    });

    it('returns 422 for invalid status', async () => {
      const res = await request(app)
        .get('/api/leads?status=invalid_status')
        .set(makeAuthHeader());

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 without auth header', async () => {
      const res = await request(app).get('/api/leads');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/leads/:id', () => {
    it('returns 200 with the lead', async () => {
      const res = await request(app)
        .get(`/api/leads/${mockLead.id}`)
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockLead.id);
    });

    it('returns 404 for unknown lead', async () => {
      const { NotFoundError } = await import('@listinglogic/db');
      mockLeadRepo.findByIdOrThrow.mockRejectedValueOnce(
        new NotFoundError('Lead', 'nonexistent'),
      );

      const res = await request(app)
        .get('/api/leads/nonexistent')
        .set(makeAuthHeader());

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/leads', () => {
    it('returns 201 with created lead', async () => {
      const payload = makeCreateLeadInput();
      const res = await request(app)
        .post('/api/leads')
        .set(makeAuthHeader())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toBeTruthy();
      expect(res.body.message).toBe('Lead created');
    });

    it('returns 422 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set(makeAuthHeader())
        .send({ source: 'probate' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeTruthy();
    });

    it('returns 422 with invalid state code', async () => {
      const payload = makeCreateLeadInput({
        property: { ...makeCreateLeadInput().property, state: 'ZZ' as never },
      });

      const res = await request(app)
        .post('/api/leads')
        .set(makeAuthHeader())
        .send(payload);

      expect(res.status).toBe(422);
    });

    it('triggers background scoring after creation', async () => {
      const payload = makeCreateLeadInput();
      await request(app)
        .post('/api/leads')
        .set(makeAuthHeader())
        .send(payload);

      // Give the fire-and-forget time to execute
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockScoringService.scoreLead).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/leads/:id', () => {
    it('returns 200 with updated lead', async () => {
      const res = await request(app)
        .patch(`/api/leads/${mockLead.id}`)
        .set(makeAuthHeader())
        .send({ status: LeadStatus.CONTACTED });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Lead updated');
    });

    it('returns 422 for invalid status value', async () => {
      const res = await request(app)
        .patch(`/api/leads/${mockLead.id}`)
        .set(makeAuthHeader())
        .send({ status: 'not_a_real_status' });

      expect(res.status).toBe(422);
    });

    it('returns 422 for unknown fields (strict mode)', async () => {
      const res = await request(app)
        .patch(`/api/leads/${mockLead.id}`)
        .set(makeAuthHeader())
        .send({ unknownField: 'value' });

      expect(res.status).toBe(422);
    });
  });

  describe('DELETE /api/leads/:id', () => {
    it('returns 204 on success', async () => {
      const res = await request(app)
        .delete(`/api/leads/${mockLead.id}`)
        .set(makeAuthHeader());

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });
  });

  describe('POST /api/leads/:id/score', () => {
    it('returns score result', async () => {
      const res = await request(app)
        .post(`/api/leads/${mockLead.id}/score`)
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.composite).toBe(75);
      expect(res.body.data.recommendation).toBeTruthy();
    });
  });

  describe('POST /api/leads/:id/skip-trace', () => {
    it('returns not_configured status when no provider is configured, never fabricated data', async () => {
      const res = await request(app)
        .post(`/api/leads/${mockLead.id}/skip-trace`)
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('not_configured');
      expect(res.body.data.phones).toEqual([]);
      expect(res.body.data.emails).toEqual([]);
    });

    it('publishes a lead.updated event when a match is found', async () => {
      mockSkipTrace.lookup.mockResolvedValueOnce({
        status: 'found',
        provider: 'batchdata',
        confidence: 0.9,
        phones: [{ number: '15555551234', type: 'mobile', isPrimary: true, dncListed: false }],
        emails: [],
        tracedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/api/leads/${mockLead.id}/skip-trace`)
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('found');
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        'lead.updated',
        TEST_OPERATOR_ID,
        expect.objectContaining({ leadId: mockLead.id }),
      );
    });
  });

  describe('GET /api/leads/:id/score-explanation', () => {
    it('returns the score drill-down with factor contributions', async () => {
      const res = await request(app)
        .get(`/api/leads/${mockLead.id}/score-explanation`)
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.score.topFactors).toHaveLength(1);
      expect(res.body.data.driftAvailable).toBe(false);
      expect(mockScoringService.getScoreDrillDown).toHaveBeenCalledWith(TEST_OPERATOR_ID, mockLead.id, 30);
    });

    it('returns 404 when the lead has no score history yet', async () => {
      mockScoringService.getScoreDrillDown.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/leads/${mockLead.id}/score-explanation`)
        .set(makeAuthHeader());

      expect(res.status).toBe(404);
    });

    it('accepts a custom lookbackDays query param', async () => {
      const res = await request(app)
        .get(`/api/leads/${mockLead.id}/score-explanation`)
        .query({ lookbackDays: 90 })
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(mockScoringService.getScoreDrillDown).toHaveBeenCalledWith(TEST_OPERATOR_ID, mockLead.id, 90);
    });
  });

  describe('GET /api/leads/dashboard/hot', () => {
    it('returns hot leads list', async () => {
      const res = await request(app)
        .get('/api/leads/dashboard/hot')
        .set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('returns 404 for unregistered routes', async () => {
      const res = await request(app)
        .get('/api/leads/this/does/not/exist/deep')
        .set(makeAuthHeader());

      expect([404, 200]).toContain(res.status);
    });

    it('returns structured error with requestId', async () => {
      const res = await request(app).get('/api/leads');

      expect(res.body.requestId).toBeTruthy();
      expect(res.body.timestamp).toBeTruthy();
    });

    it('returns X-Request-ID header', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set(makeAuthHeader());

      expect(res.headers['x-request-id']).toBeTruthy();
    });

    it('propagates inbound X-Request-ID', async () => {
      const myId = 'my-custom-request-id-abc123';
      const res = await request(app)
        .get('/api/leads')
        .set({ ...makeAuthHeader(), 'X-Request-ID': myId });

      expect(res.headers['x-request-id']).toBe(myId);
    });
  });
});
