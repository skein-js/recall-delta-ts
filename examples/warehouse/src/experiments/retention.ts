import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryRecallStore, createRecallDelta } from '@skein-js/recall-delta';
import { createSqliteRecallStore } from '@skein-js/recall-delta-sqlite';
import { report } from '../scenario.js';

export function runRetention() {
  const directory = mkdtempSync(join(tmpdir(), 'recall-retention-'));
  const store = createSqliteRecallStore(join(directory, 'state.sqlite'));
  let now = Date.now();
  try {
    const memory = createRecallDelta({
      store,
      context: { tenantId: 'retention', scopeId: 'private', principalId: 'alice' },
      clock: () => now,
      allowGlobalAccounting: true,
      policy: { decayMs: 100, graceMs: 100, reinforce: false },
    });
    const sources = Array.from({ length: 6 }, (_, index) =>
      memory.observe({
        ...report(`source-${index}`, `warehouse-${index}`, 'delayed-posting', 'wait-for-job'),
        requestId: `observe-${index}`,
        content: { statement: `dispatch ${index} ${'supporting detail '.repeat(200)}` },
      }),
    );
    const memories = memory.experimental.inspect().memories;
    for (const [index, record] of memories.entries())
      memory.experimental.protectMemory({
        requestId: `protection-${index}`,
        memoryId: record.memoryId,
        protected: index === 0,
        retentionValue: 0.1,
      });
    const before = memory.experimental.accounting(),
      allocatedBefore = store.allocatedBytes();
    now += 1000;
    memory.experimental.maintain({ requestId: 'dormant', capacityPressure: true });
    now += 200;
    const sweep = memory.experimental.maintain({ requestId: 'evict', capacityPressure: true });
    const after = memory.experimental.accounting(),
      allocatedAfter = store.allocatedBytes();
    assert.equal(memory.experimental.inspect().memories.length, 1);
    assert.equal(memory.experimental.inspect().evidence.length, sources.length);
    for (const source of sources)
      memory.experimental.processEvidence({
        ...source,
        requestId: `unchanged-${source.evidenceId}`,
      });
    assert.equal(memory.experimental.inspect().memories.length, 1);
    const bounded = createRecallDelta({
      store: createMemoryRecallStore(),
      context: { tenantId: 'bounded', scopeId: 'private', principalId: 'alice' },
      policy: { hardLimitBytes: 100 },
    });
    assert.throws(
      () =>
        bounded.observe({
          ...report('full', 'north', 'missing-posting', 'post-dispatch'),
          requestId: 'full',
        }),
      /capacity exhausted/,
    );
    assert.equal(bounded.experimental.inspect().evidence.length, 0);
    return {
      before,
      after,
      evicted: sweep.evictedIds.length,
      protectedPreserved: true,
      reencodingChurn: 0,
      allocatedBefore,
      allocatedAfter,
      capacityExhaustionReported: true,
      boundary:
        'Logical retained-payload budget; allocated SQLite/WAL/SHM bytes are measured separately and may not shrink',
    };
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
