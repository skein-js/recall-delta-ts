import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createProtocolRuntime } from '@skein-js/agent-protocol';
import { embedSqliteGraphs } from '@skein-js/local';
import { createRecallDelta } from '@skein-js/recall-delta';
import { createSqliteRecallStore } from '@skein-js/recall-delta-sqlite';
import { z } from 'zod';

import { planSchema } from './domain.js';
import { makeWarehouseGraph } from './graph.js';
import { createVertexPlanner } from './planner.js';
import { demoSteps } from './scenario.js';

const vertex = process.argv.includes('--vertex');
const planner = vertex ? await createVertexPlanner() : undefined;
const directory = mkdtempSync(resolve(tmpdir(), 'recall-delta-demo-'));
const store = createSqliteRecallStore(resolve(directory, 'recall.sqlite'));
const memory = createRecallDelta({
  store,
  context: { tenantId: 'demo', scopeId: 'private', principalId: 'alice' },
  processingMode: 'deferred',
  allowGlobalAccounting: true,
});
const compiled = makeWarehouseGraph({ memory: () => memory, mode: 'associative', planner });
const local = await embedSqliteGraphs(
  { warehouse: compiled },
  { sqlitePath: resolve(directory, 'skein.sqlite') },
);
const runtime = createProtocolRuntime(local.deps);
try {
  await runtime.service.assistants.registerGraphAssistants();
  runtime.worker.start();
  // Skein invokes the compiled graph and injects its persisted checkpoint saver.
  const assistant = (await runtime.service.assistants.search({ graph_id: 'warehouse' }))[0];
  if (!assistant) throw new Error('Skein did not register the warehouse assistant');
  const thread = await runtime.service.threads.create({});
  const traces: unknown[] = [];
  const appendCompletedRun = (run: { result: unknown }) => {
    const parsed = z
      .object({ plan: planSchema, actionCommitted: z.boolean() })
      .safeParse(run.result);
    if (!parsed.success)
      throw new Error(
        `Warehouse run failed before producing a validated plan. Inspect the private Skein run in ${directory}; no fixture fallback was used.`,
      );
    traces.push(run);
  };
  for (const step of demoSteps) {
    const result = await runtime.service.runs.createWait({
      thread_id: thread.thread_id,
      assistant_id: assistant.assistant_id,
      input: step,
    });
    appendCompletedRun(result);
  }
  const south = memory.experimental
    .inspect()
    .evidence.find((record) => record.observationId === 'incident-south');
  if (!south) throw new Error('Missing source');
  const correction = {
    ...demoSteps[1],
    runId: 'demo-3',
    observations: [
      {
        observationId: 'south-correction',
        kind: 'document' as const,
        observedAt: new Date().toISOString(),
        source: { type: 'correction', id: 'south-correction' },
        content: {
          correctsEvidenceId: south.evidenceId,
          warehouse: 'south',
          symptom: 'dispatch ERP stock discrepancy',
          diagnosis: 'missing-posting',
          action: 'post-dispatch',
        },
      },
    ],
  };
  appendCompletedRun(
    await runtime.service.runs.createWait({
      thread_id: thread.thread_id,
      assistant_id: assistant.assistant_id,
      input: correction,
    }),
  );
  mkdirSync('reports', { recursive: true });
  const output = {
    execution: vertex ? 'vertex-agent' : 'deterministic-fixture',
    directory,
    traces,
    inspection: memory.experimental.inspect(),
    accounting: memory.experimental.accounting(),
    sqliteAllocatedBytes: store.allocatedBytes(),
    limitations: [
      'Offline fixture decisions are not LLM task-quality evidence',
      'Skein and Recall Delta own separate SQLite files',
    ],
  };
  writeFileSync('reports/demo.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
} finally {
  await runtime.worker.stop();
  await local.dispose();
  store.close();
}
