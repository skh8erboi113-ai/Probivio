import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BuyerNotificationService } from '../../src/services/buyer-notification.service.js';
import { makeBuyer, makeLead } from '../factories.js';

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

function makeMatch(overrides?: Record<string, unknown>) {
  return {
    buyer: makeBuyer({ notifyOnMatch: true, notificationThreshold: 70 } as never),
    matchScore: 85,
    matchReasons: ['Proof of funds verified'],
    disqualifiers: [],
    estimatedAssignmentFee: 500_000 as never,
    ...overrides,
  };
}

describe('BuyerNotificationService', () => {
  let buyerMatching: { match: ReturnType<typeof vi.fn> };
  let notificationRepo: { alreadyNotified: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let sendgrid: { isEnabled: ReturnType<typeof vi.fn>; sendEmail: ReturnType<typeof vi.fn> };
  let eventPublisher: { publish: ReturnType<typeof vi.fn> };
  let service: BuyerNotificationService;

  beforeEach(() => {
    buyerMatching = { match: vi.fn().mockResolvedValue([makeMatch()]) };
    notificationRepo = {
      alreadyNotified: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue(undefined),
    };
    sendgrid = { isEnabled: vi.fn().mockReturnValue(true), sendEmail: vi.fn().mockResolvedValue({ statusCode: 202 }) };
    eventPublisher = { publish: vi.fn() };

    service = new BuyerNotificationService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buyerMatching as any,
      notificationRepo as any,
      sendgrid as any,
      eventPublisher as any,
      makeLogger(),
    );
  });

  it('emails an eligible buyer above their threshold and logs the notification', async () => {
    const lead = makeLead();
    await service.notifyMatchingBuyers(OPERATOR_ID, lead);

    expect(sendgrid.sendEmail).toHaveBeenCalledTimes(1);
    expect(notificationRepo.create).toHaveBeenCalledWith(
      OPERATOR_ID,
      expect.objectContaining({ matchScore: 85 }),
    );
  });

  it('never emails the same buyer twice for the same lead (idempotent)', async () => {
    notificationRepo.alreadyNotified.mockResolvedValue(true);

    const lead = makeLead();
    await service.notifyMatchingBuyers(OPERATOR_ID, lead);

    expect(sendgrid.sendEmail).not.toHaveBeenCalled();
    expect(notificationRepo.create).not.toHaveBeenCalled();
  });

  it('skips buyers who opted out of match notifications', async () => {
    buyerMatching.match.mockResolvedValue([
      makeMatch({ buyer: makeBuyer({ notifyOnMatch: false } as never) }),
    ]);

    const lead = makeLead();
    await service.notifyMatchingBuyers(OPERATOR_ID, lead);

    expect(sendgrid.sendEmail).not.toHaveBeenCalled();
  });

  it('skips buyers whose match score is below their personal threshold', async () => {
    buyerMatching.match.mockResolvedValue([
      makeMatch({
        matchScore: 50,
        buyer: makeBuyer({ notifyOnMatch: true, notificationThreshold: 70 } as never),
      }),
    ]);

    const lead = makeLead();
    await service.notifyMatchingBuyers(OPERATOR_ID, lead);

    expect(sendgrid.sendEmail).not.toHaveBeenCalled();
  });

  it('falls back to the default 70% threshold when a buyer has not set one', async () => {
    buyerMatching.match.mockResolvedValue([
      makeMatch({
        matchScore: 75,
        buyer: makeBuyer({ notifyOnMatch: true, notificationThreshold: undefined } as never),
      }),
    ]);

    const lead = makeLead();
    await service.notifyMatchingBuyers(OPERATOR_ID, lead);

    expect(sendgrid.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('never throws even if the underlying match/email calls fail', async () => {
    buyerMatching.match.mockRejectedValue(new Error('firestore down'));

    const lead = makeLead();
    await expect(service.notifyMatchingBuyers(OPERATOR_ID, lead)).resolves.toBeUndefined();
  });

  it('does not send (or log a notification) when SendGrid is disabled', async () => {
    sendgrid.isEnabled.mockReturnValue(false);

    const lead = makeLead();
    await service.notifyMatchingBuyers(OPERATOR_ID, lead);

    expect(sendgrid.sendEmail).not.toHaveBeenCalled();
    expect(notificationRepo.create).not.toHaveBeenCalled();
  });
});
