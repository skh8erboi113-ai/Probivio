import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetConfigForTests } from '../../src/config/config.js';
import { SkipTraceService } from '../../src/services/skip-trace.service.js';

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

const INPUT = {
  firstName: 'Jane',
  lastName: 'Doe',
  address: '1011 Rosegold St',
  city: 'Franklin Square',
  state: 'NY',
  zip: '11010',
};

describe('SkipTraceService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    _resetConfigForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SKIP_TRACE_API_KEY;
    _resetConfigForTests();
  });

  it('returns not_configured (never fabricated data) when no API key is set', async () => {
    delete process.env.SKIP_TRACE_API_KEY;
    const service = new SkipTraceService(makeLogger());

    const result = await service.lookup(INPUT);

    expect(result.status).toBe('not_configured');
    expect(result.provider).toBeNull();
    expect(result.phones).toEqual([]);
    expect(result.emails).toEqual([]);
  });

  it('returns found with real provider data on a successful match', async () => {
    process.env.SKIP_TRACE_API_KEY = 'test-batchdata-key';
    _resetConfigForTests();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          persons: [
            {
              emails: [{ email: 'jane.doe@example.com' }],
              phoneNumbers: [{ number: '15555551234', type: 'Mobile', score: '92' }],
              dnc: { mobile: false },
              meta: { matched: true },
            },
          ],
        },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const service = new SkipTraceService(makeLogger());
    const result = await service.lookup(INPUT);

    expect(result.status).toBe('found');
    expect(result.provider).toBe('batchdata');
    expect(result.phones).toHaveLength(1);
    expect(result.phones[0]?.number).toBe('15555551234');
    expect(result.phones[0]?.type).toBe('mobile');
    expect(result.emails).toEqual(['jane.doe@example.com']);
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it('returns not_found when the provider matches nothing', async () => {
    process.env.SKIP_TRACE_API_KEY = 'test-batchdata-key';
    _resetConfigForTests();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: { persons: [] } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const service = new SkipTraceService(makeLogger());
    const result = await service.lookup(INPUT);

    expect(result.status).toBe('not_found');
    expect(result.provider).toBe('batchdata');
  });

  it('returns not_found (not a provider error) when the lead has no address on file', async () => {
    process.env.SKIP_TRACE_API_KEY = 'test-batchdata-key';
    _resetConfigForTests();

    global.fetch = vi.fn();
    const service = new SkipTraceService(makeLogger());

    const result = await service.lookup({ firstName: 'Jane', lastName: 'Doe' });

    expect(result.status).toBe('not_found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns unavailable (never fabricated data) when the provider call fails repeatedly', async () => {
    process.env.SKIP_TRACE_API_KEY = 'test-batchdata-key';
    _resetConfigForTests();

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);

    const service = new SkipTraceService(makeLogger());
    const result = await service.lookup(INPUT);

    expect(result.status).toBe('unavailable');
    expect(result.phones).toEqual([]);
    expect(result.emails).toEqual([]);
  });
});
