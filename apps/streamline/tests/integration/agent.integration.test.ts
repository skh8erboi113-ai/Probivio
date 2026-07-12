import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

import { createApp } from '../../src/app.js';
import { createAgentRouter } from '../../src/routes/agent.routes.js';
import { makeAuthHeader, TEST_OPERATOR_ID } from '../factories.js';

const mockDecision = {
  id: 'decision_1',
  operatorId: TEST_OPERATOR_ID,
  leadId: 'lead_1',
  trigger: 'lead_created',
  action: { type: 'add_tag', tag: 'hot' },
  reasoning: 'Lead looks promising.',
  confidence: 0.4,
  alternativesConsidered: [{ action: 'send_email', reasonRejected: 'already emailed today' }],
  executed: false,
  pendingApproval: true,
  modelVersion: 'gemini-2.5-flash',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockDecisionLogRepo = {
  listWithFilters: vi.fn().mockResolvedValue({ items: [mockDecision], total: 1, hasMore: false, nextCursor: null }),
};

const mockAgentSettingsRepo = {
  getCurrent: vi.fn().mockResolvedValue({
    id: TEST_OPERATOR_ID,
    operatorId: TEST_OPERATOR_ID,
    autonomyThreshold: 0.75,
    requireApprovalForEmail: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  update: vi.fn().mockImplementation((_op: string, patch: Record<string, unknown>) =>
    Promise.resolve({
      id: TEST_OPERATOR_ID,
      operatorId: TEST_OPERATOR_ID,
      autonomyThreshold: 0.75,
      requireApprovalForEmail: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...patch,
    }),
  ),
};

const mockAgentService = {
  evaluateLead: vi.fn(),
  resolveApproval: vi.fn().mockResolvedValue({ ...mockDecision, executed: true, pendingApproval: false }),
};

function buildApp(): Application {
  return createApp({
    routers: [
      {
        path: '/api/agent',
        router: createAgentRouter({
          decisionLogRepo: mockDecisionLogRepo as never,
          agentSettingsRepo: mockAgentSettingsRepo as never,
          agentService: mockAgentService as never,
        }),
      },
    ],
  });
}

describe('Agent API — Integration', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDecisionLogRepo.listWithFilters.mockResolvedValue({
      items: [mockDecision],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
    app = buildApp();
  });

  describe('GET /api/agent/decisions', () => {
    it('returns decisions including confidence and alternativesConsidered', async () => {
      const res = await request(app).get('/api/agent/decisions').set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data[0].confidence).toBe(0.4);
      expect(res.body.data[0].alternativesConsidered).toHaveLength(1);
      expect(res.body.data[0].pendingApproval).toBe(true);
    });
  });

  describe('GET /api/agent/settings', () => {
    it('returns the operator autonomy settings', async () => {
      const res = await request(app).get('/api/agent/settings').set(makeAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.data.autonomyThreshold).toBe(0.75);
      expect(res.body.data.requireApprovalForEmail).toBe(true);
    });
  });

  describe('PATCH /api/agent/settings', () => {
    it('updates the autonomy threshold', async () => {
      const res = await request(app)
        .patch('/api/agent/settings')
        .set(makeAuthHeader())
        .send({ autonomyThreshold: 0.5 });

      expect(res.status).toBe(200);
      expect(mockAgentSettingsRepo.update).toHaveBeenCalledWith(TEST_OPERATOR_ID, { autonomyThreshold: 0.5 });
      expect(res.body.data.autonomyThreshold).toBe(0.5);
    });

    it('rejects a threshold outside the 0.05-1 bounds', async () => {
      const res = await request(app)
        .patch('/api/agent/settings')
        .set(makeAuthHeader())
        .send({ autonomyThreshold: 0 });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/agent/decisions/:id/resolve', () => {
    it('approves a pending decision', async () => {
      const res = await request(app)
        .post('/api/agent/decisions/decision_1/resolve')
        .set(makeAuthHeader())
        .send({ approve: true });

      expect(res.status).toBe(200);
      expect(mockAgentService.resolveApproval).toHaveBeenCalledWith(TEST_OPERATOR_ID, 'decision_1', true);
      expect(res.body.data.executed).toBe(true);
    });

    it('rejects a pending decision', async () => {
      mockAgentService.resolveApproval.mockResolvedValueOnce({
        ...mockDecision,
        executed: false,
        pendingApproval: false,
        blockedReason: 'rejected_by_operator',
      });

      const res = await request(app)
        .post('/api/agent/decisions/decision_1/resolve')
        .set(makeAuthHeader())
        .send({ approve: false });

      expect(res.status).toBe(200);
      expect(mockAgentService.resolveApproval).toHaveBeenCalledWith(TEST_OPERATOR_ID, 'decision_1', false);
      expect(res.body.data.blockedReason).toBe('rejected_by_operator');
    });

    it('requires the approve field in the body', async () => {
      const res = await request(app)
        .post('/api/agent/decisions/decision_1/resolve')
        .set(makeAuthHeader())
        .send({});

      expect(res.status).toBe(422);
    });
  });
});
