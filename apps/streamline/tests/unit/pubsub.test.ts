import { describe, expect, it, vi } from 'vitest';

import { InProcessPubSub, type RealtimeEvent } from '../../src/realtime/pubsub.js';

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

describe('InProcessPubSub', () => {
  it('delivers published events only to subscribers of the same operator', () => {
    const pubsub = new InProcessPubSub(makeLogger());

    const opAEvents: RealtimeEvent[] = [];
    const opBEvents: RealtimeEvent[] = [];

    const unsubA = pubsub.subscribe('op_a', (event) => opAEvents.push(event));
    const unsubB = pubsub.subscribe('op_b', (event) => opBEvents.push(event));

    pubsub.publish({
      type: 'lead.created',
      operatorId: 'op_a',
      payload: { leadId: 'lead_1' },
      timestamp: new Date().toISOString(),
    });

    expect(opAEvents).toHaveLength(1);
    expect(opAEvents[0]?.operatorId).toBe('op_a');
    expect(opBEvents).toHaveLength(0);

    unsubA();
    unsubB();
  });

  it('stops delivering events after unsubscribe', () => {
    const pubsub = new InProcessPubSub(makeLogger());
    const events: RealtimeEvent[] = [];

    const unsubscribe = pubsub.subscribe('op_a', (event) => events.push(event));
    unsubscribe();

    pubsub.publish({
      type: 'lead.scored',
      operatorId: 'op_a',
      payload: {},
      timestamp: new Date().toISOString(),
    });

    expect(events).toHaveLength(0);
  });

  it('supports multiple subscribers for the same operator (multi-tab/multi-device)', () => {
    const pubsub = new InProcessPubSub(makeLogger());
    const received: number[] = [];

    const unsub1 = pubsub.subscribe('op_a', () => received.push(1));
    const unsub2 = pubsub.subscribe('op_a', () => received.push(2));

    pubsub.publish({
      type: 'agent.decision',
      operatorId: 'op_a',
      payload: {},
      timestamp: new Date().toISOString(),
    });

    expect(received.sort()).toEqual([1, 2]);
    unsub1();
    unsub2();
  });

  it('shutdown removes all listeners', async () => {
    const pubsub = new InProcessPubSub(makeLogger());
    const events: RealtimeEvent[] = [];
    pubsub.subscribe('op_a', (event) => events.push(event));

    await pubsub.shutdown();

    pubsub.publish({
      type: 'lead.updated',
      operatorId: 'op_a',
      payload: {},
      timestamp: new Date().toISOString(),
    });

    expect(events).toHaveLength(0);
  });
});
