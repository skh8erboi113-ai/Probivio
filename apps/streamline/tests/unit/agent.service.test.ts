import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentService } from '../../src/services/agent.service.js';
import { makeLead } from '../factories.js';

function makeLogger() {
  return {
    child: () => makeLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const OPERATOR_ID = 'op_test' as never;
const LEAD_ID = 'lead_1' as never;

function makeDeps(overrides?: {
  readonly decision?: Record<string, unknown>;
  readonly autonomyThreshold?: number;
  readonly requireApprovalForEmail?: boolean;
}) {
  const lead = makeLead({ contact: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' } as never });

  const leadRepo = {
    findByIdOrThrow: vi.fn().mockResolvedValue(lead),
    update: vi.fn().mockResolvedValue(lead),
  };

  const interactionRepo = {
    computeFeatures: vi.fn().mockResolvedValue({
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
    }),
  };

  const decisionLogRepo = {
    create: vi.fn().mockImplementation((_op: string, input: Record<string, unknown>) =>
      Promise.resolve({ id: 'decision_1', operatorId: OPERATOR_ID, createdAt: 'now', updatedAt: 'now', ...input }),
    ),
    countExecutedEmailsSince: vi.fn().mockResolvedValue(0),
    findByIdOrThrow: vi.fn(),
    resolveApproval: vi.fn(),
  };

  const agentSettingsRepo = {
    getCurrent: vi.fn().mockResolvedValue({
      id: OPERATOR_ID,
      operatorId: OPERATOR_ID,
      autonomyThreshold: overrides?.autonomyThreshold ?? 0.75,
      requireApprovalForEmail: overrides?.requireApprovalForEmail ?? false,
      createdAt: 'now',
      updatedAt: 'now',
    }),
    update: vi.fn(),
  };

  const gemini = {
    isEnabled: vi.fn().mockReturnValue(true),
    decideNextAction: vi.fn().mockResolvedValue({
      reasoning: 'Lead looks promising, tagging as hot.',
      confidence: 0.9,
      alternativesConsidered: [{ action: 'send_email', reasonRejected: 'already emailed today' }],
      action: { type: 'add_tag', tag: 'hot' },
      ...overrides?.decision,
    }),
  };

  const sendgrid = { sendEmail: vi.fn().mockResolvedValue({ statusCode: 202, messageId: 'msg_1' }) };
  const eventPublisher = { publish: vi.fn() };

  return { lead, leadRepo, interactionRepo, decisionLogRepo, agentSettingsRepo, gemini, sendgrid, eventPublisher };
}

describe('AgentService — counterfactual reasoning + confidence-gated autonomy', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: AgentService;

  function buildService(d: ReturnType<typeof makeDeps> = deps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new AgentService(
      d.leadRepo as any,
      d.interactionRepo as any,
      d.decisionLogRepo as any,
      d.agentSettingsRepo as any,
      d.gemini as any,
      d.sendgrid as any,
      d.eventPublisher as any,
      makeLogger(),
    );
  }

  beforeEach(() => {
    deps = makeDeps();
    service = buildService();
  });

  it('persists confidence and alternativesConsidered on the decision log', async () => {
    await service.evaluateLead(OPERATOR_ID, LEAD_ID, 'lead_created');

    expect(deps.decisionLogRepo.create).toHaveBeenCalledWith(
      OPERATOR_ID,
      expect.objectContaining({
        confidence: 0.9,
        alternativesConsidered: [{ action: 'send_email', reasonRejected: 'already emailed today' }],
      }),
    );
  });

  it('auto-executes a high-confidence non-email action above the autonomy threshold', async () => {
    const log = await service.evaluateLead(OPERATOR_ID, LEAD_ID, 'lead_created');

    expect(deps.leadRepo.update).toHaveBeenCalledWith(OPERATOR_ID, deps.lead.id, { tags: ['hot'] });
    expect(deps.decisionLogRepo.create).toHaveBeenCalledWith(
      OPERATOR_ID,
      expect.objectContaining({ executed: true }),
    );
    expect(log).toBeDefined();
  });

  it('drafts (does not execute) a decision below the operator autonomy threshold', async () => {
    deps = makeDeps({ decision: { confidence: 0.4 }, autonomyThreshold: 0.75 });
    service = buildService();

    await service.evaluateLead(OPERATOR_ID, LEAD_ID, 'lead_created');

    expect(deps.leadRepo.update).not.toHaveBeenCalled();
    expect(deps.decisionLogRepo.create).toHaveBeenCalledWith(
      OPERATOR_ID,
      expect.objectContaining({ executed: false, pendingApproval: true }),
    );
  });

  it('always requires approval for send_email when the operator has that setting on, regardless of confidence', async () => {
    deps = makeDeps({
      decision: {
        confidence: 0.99,
        action: { type: 'send_email', subject: 'Hi', body: 'Following up' },
        alternativesConsidered: [],
      },
      requireApprovalForEmail: true,
    });
    service = buildService();

    await service.evaluateLead(OPERATOR_ID, LEAD_ID, 'lead_created');

    expect(deps.sendgrid.sendEmail).not.toHaveBeenCalled();
    expect(deps.decisionLogRepo.create).toHaveBeenCalledWith(
      OPERATOR_ID,
      expect.objectContaining({ executed: false, pendingApproval: true }),
    );
  });

  it('never gates no_action decisions on confidence — they always "execute" (there is nothing to approve)', async () => {
    deps = makeDeps({ decision: { confidence: 0.01, action: { type: 'no_action' }, alternativesConsidered: [] } });
    service = buildService();

    await service.evaluateLead(OPERATOR_ID, LEAD_ID, 'lead_created');

    expect(deps.decisionLogRepo.create).toHaveBeenCalledWith(
      OPERATOR_ID,
      expect.objectContaining({ executed: true }),
    );
  });

  describe('resolveApproval', () => {
    it('executes the exact drafted action when approved', async () => {
      deps.decisionLogRepo.findByIdOrThrow.mockResolvedValue({
        id: 'decision_1',
        leadId: LEAD_ID,
        trigger: 'lead_created',
        action: { type: 'add_tag', tag: 'hot' },
        reasoning: 'test',
        executed: false,
        pendingApproval: true,
        modelVersion: 'gemini-2.5-flash',
      });
      deps.decisionLogRepo.resolveApproval.mockResolvedValue({ id: 'decision_1', executed: true });

      await service.resolveApproval(OPERATOR_ID, 'decision_1', true);

      expect(deps.leadRepo.update).toHaveBeenCalledWith(OPERATOR_ID, deps.lead.id, { tags: ['hot'] });
      expect(deps.decisionLogRepo.resolveApproval).toHaveBeenCalledWith(OPERATOR_ID, 'decision_1', {
        executed: true,
      });
    });

    it('never executes the action when rejected', async () => {
      deps.decisionLogRepo.findByIdOrThrow.mockResolvedValue({
        id: 'decision_1',
        leadId: LEAD_ID,
        trigger: 'lead_created',
        action: { type: 'add_tag', tag: 'hot' },
        reasoning: 'test',
        executed: false,
        pendingApproval: true,
        modelVersion: 'gemini-2.5-flash',
      });
      deps.decisionLogRepo.resolveApproval.mockResolvedValue({ id: 'decision_1', executed: false });

      await service.resolveApproval(OPERATOR_ID, 'decision_1', false);

      expect(deps.leadRepo.update).not.toHaveBeenCalled();
      expect(deps.decisionLogRepo.resolveApproval).toHaveBeenCalledWith(OPERATOR_ID, 'decision_1', {
        executed: false,
        blockedReason: 'rejected_by_operator',
      });
    });

    it('throws when the decision is not actually pending approval', async () => {
      deps.decisionLogRepo.findByIdOrThrow.mockResolvedValue({
        id: 'decision_1',
        leadId: LEAD_ID,
        action: { type: 'no_action' },
        reasoning: 'test',
        executed: true,
        pendingApproval: false,
        modelVersion: 'gemini-2.5-flash',
      });

      await expect(service.resolveApproval(OPERATOR_ID, 'decision_1', true)).rejects.toThrow(/not awaiting approval/);
    });
  });
});
