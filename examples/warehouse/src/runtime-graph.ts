import { resolve } from 'node:path';
import { createRecallDelta, type RecallDeltaClient } from '@skein-js/recall-delta';
import { createSqliteRecallStore } from '@skein-js/recall-delta-sqlite';
import { makeWarehouseGraph } from './graph.js';
import { createVertexPlanner, fixturePlanner, type Planner } from './planner.js';

let client: RecallDeltaClient | undefined;
let planner: Promise<Planner> | undefined;
function memory() {
  client ??= createRecallDelta({
    store: createSqliteRecallStore(
      resolve(process.env['RECALL_DATA_DIR'] ?? '.skein', 'recall.sqlite'),
    ),
    context: { tenantId: 'local-demo', scopeId: 'warehouse-private', principalId: 'demo-user' },
    processingMode: 'deferred',
    allowGlobalAccounting: true,
  });
  return client;
}
export const graph = makeWarehouseGraph({
  memory,
  mode: 'associative',
  planner: async (input) => {
    if (process.env['RECALL_MODEL_PROVIDER'] !== 'vertex') return fixturePlanner(input);
    planner ??= createVertexPlanner();
    return (await planner)(input);
  },
});
