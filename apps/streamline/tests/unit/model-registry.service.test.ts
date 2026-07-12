import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelRegistryService } from '../../src/services/model-registry.service.js';

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

describe('ModelRegistryService', () => {
  let getCurrent: ReturnType<typeof vi.fn>;
  let weightsRepo: { getCurrent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    getCurrent = vi.fn().mockResolvedValue(null); // no model registered → getModel resolves null
    weightsRepo = { getCurrent };
  });

  it('returns null (heuristic fallback) when no model is registered, without throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ModelRegistryService(weightsRepo as any, makeLogger());
    const model = await service.getModel('op_1');
    expect(model).toBeNull();
    expect(getCurrent).toHaveBeenCalledWith('op_1');
  });

  it('de-duplicates concurrent cold-start loads for the same operator', async () => {
    let callCount = 0;
    getCurrent.mockImplementation(async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return null;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ModelRegistryService(weightsRepo as any, makeLogger());

    // Fire 5 concurrent requests for the same operator before the first resolves.
    const results = await Promise.all([
      service.getModel('op_1'),
      service.getModel('op_1'),
      service.getModel('op_1'),
      service.getModel('op_1'),
      service.getModel('op_1'),
    ]);

    expect(results).toEqual([null, null, null, null, null]);
    // Only one underlying repo call despite 5 concurrent callers.
    expect(callCount).toBe(1);
  });

  it('does not de-duplicate across different operators', async () => {
    getCurrent.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ModelRegistryService(weightsRepo as any, makeLogger());

    await Promise.all([service.getModel('op_1'), service.getModel('op_2')]);

    expect(getCurrent).toHaveBeenCalledWith('op_1');
    expect(getCurrent).toHaveBeenCalledWith('op_2');
    expect(getCurrent).toHaveBeenCalledTimes(2);
  });

  it('invalidate() clears the cache so the next getModel() re-fetches', async () => {
    getCurrent.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ModelRegistryService(weightsRepo as any, makeLogger());

    await service.getModel('op_1');
    expect(getCurrent).toHaveBeenCalledTimes(1);

    // Cached — a second call within TTL should NOT hit the repo again.
    await service.getModel('op_1');
    expect(getCurrent).toHaveBeenCalledTimes(1);

    service.invalidate('op_1');

    await service.getModel('op_1');
    expect(getCurrent).toHaveBeenCalledTimes(2);
  });

  it('warmUp() pre-loads models for multiple operators and tolerates individual failures', async () => {
    getCurrent.mockImplementation(async (operatorId: string) => {
      if (operatorId === 'op_bad') throw new Error('Firestore unavailable');
      return null;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ModelRegistryService(weightsRepo as any, makeLogger());

    await expect(service.warmUp(['op_1', 'op_bad', 'op_2'])).resolves.toBeUndefined();
    expect(getCurrent).toHaveBeenCalledTimes(3);

    // op_1 and op_2 should now be cached (no further repo calls on next getModel).
    await service.getModel('op_1');
    await service.getModel('op_2');
    expect(getCurrent).toHaveBeenCalledTimes(3);
  });

  it('warmUp() with an empty list is a no-op', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ModelRegistryService(weightsRepo as any, makeLogger());
    await service.warmUp([]);
    expect(getCurrent).not.toHaveBeenCalled();
  });
});
