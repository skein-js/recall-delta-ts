import { afterEach, expect, it, vi } from 'vitest';
import { createMemoryRecallStore, createRecallDelta } from '@skein-js/recall-delta';
import { makeWarehouseGraph } from '../graph.js';
import { createVertexPlanner } from '../planner.js';
import { auditHindsightResponse } from '../experiments/hindsight.js';
afterEach(() => vi.unstubAllEnvs());

it('lets the context-only baseline investigate current state without historical memory', async () => {
  const memory = createRecallDelta({
    store: createMemoryRecallStore(),
    context: { tenantId: 'test', scopeId: 'private', principalId: 'alice' },
  });
  const graph = makeWarehouseGraph({ memory: () => memory, mode: 'context' });
  const result = await graph.invoke({
    runId: 'context',
    cues: ['north warehouse discrepancy'],
    observations: [],
    system: { warehouse: 'north', dispatchPosted: false, erpUpdated: false, postingJob: 'missing' },
  });
  expect(result.plan?.diagnosis).toBe('missing-posting');
  expect(result.actionCommitted).toBe(true);
  expect(result.toolCalls).toBe(2);
  expect(result.plan?.basedOn).toEqual([]);
});

it('fails before initializing a live provider when required Vertex configuration is missing', async () => {
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', undefined);
  vi.stubEnv('GOOGLE_CLOUD_LOCATION', undefined);
  vi.stubEnv('VERTEX_MODEL', undefined);
  await expect(createVertexPlanner()).rejects.toThrow();
});

it('maps admitted backend sources while refusing to invent missing lineage', () => {
  const rows = auditHindsightResponse(
    {
      results: [
        { id: 'memory-1', text: 'a fact', document_id: 'document-1' },
        { id: 'memory-2', text: 'an unlinked interpretation' },
      ],
    },
    new Map([['document-1', 'evidence-1']]),
  );
  expect(rows[0]?.evidenceId).toBe('evidence-1');
  expect(rows[1]?.evidenceId).toBeNull();
  expect(rows[1]?.missing).toContain('admitted source lineage');
});
