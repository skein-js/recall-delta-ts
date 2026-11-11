import {
  createMemoryRecallStore,
  createRecallDelta,
  protocolVersion,
  type Observation,
  type RecallOptions,
} from '../index.js';
export const instant = Date.parse('2026-11-11T10:00:00Z');
export function observation(
  id: string,
  content: Observation['content'] = 'dispatch warehouse north ERP discrepancy',
): Observation {
  return {
    observationId: id,
    content,
    kind: 'document',
    observedAt: new Date(instant).toISOString(),
    source: { type: 'test-report', id },
  };
}
export function harness(options: Partial<RecallOptions> = {}) {
  let now = instant;
  const store = options.store ?? createMemoryRecallStore();
  const client = createRecallDelta({
    store,
    context: { tenantId: 'tenant', scopeId: 'private', principalId: 'alice' },
    clock: () => now,
    allowGlobalAccounting: true,
    ...options,
  });
  const open = (requestId = 'open') =>
    client.openSession({
      requestId,
      protocolVersion,
      taskRef: 'task',
      expiresAt: new Date(now + 3_600_000).toISOString(),
    });
  return {
    store,
    client,
    open,
    setTime: (time: number) => {
      now = time;
    },
  };
}
