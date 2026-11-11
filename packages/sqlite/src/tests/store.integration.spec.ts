import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { createRecallDelta } from '@skein-js/recall-delta';
import { createSqliteRecallStore } from '../index.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function filename() {
  const directory = mkdtempSync(join(tmpdir(), 'recall-store-test-'));
  directories.push(directory);
  return join(directory, 'recall.sqlite');
}
const context = { tenantId: 'test', scopeId: 'private', principalId: 'alice' };
const observation = {
  requestId: 'ingest',
  observationId: 'event',
  kind: 'event',
  content: 'warehouse dispatch',
  observedAt: '2026-11-11T00:00:00Z',
  source: { type: 'fixture', id: 'event' },
};

it('rolls back failed transactions, reopens acknowledged data and deduplicates work after restart', () => {
  const path = filename(),
    store = createSqliteRecallStore(path);
  const client = createRecallDelta({ store, context, processingMode: 'deferred' });
  const source = client.observe(observation);
  expect(() =>
    store.transact((state) => {
      state.sequence = 9999;
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  expect(store.read().sequence).not.toBe(9999);
  store.close();
  const reopened = createSqliteRecallStore(path);
  try {
    const recovered = createRecallDelta({ store: reopened, context, processingMode: 'deferred' });
    expect(recovered.observe(observation)).toEqual(source);
    expect(recovered.experimental.readProcessing(source).status).toBe('pending');
    recovered.experimental.processEvidence({ ...source, requestId: 'process' });
    expect(recovered.experimental.inspect().memories).toHaveLength(1);
    expect(reopened.allocatedBytes()).toBeGreaterThan(0);
  } finally {
    reopened.close();
  }
});

it('survives process loss inside a transaction and preserves a previously acknowledged receipt', () => {
  const path = filename(),
    store = createSqliteRecallStore(path);
  const client = createRecallDelta({ store, context });
  const receipt = client.observe(observation);
  store.close();
  const child = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `
    import { createSqliteRecallStore } from ${JSON.stringify(new URL('../../dist/index.js', import.meta.url).href)};
    const store = createSqliteRecallStore(process.argv[1]);
    store.transact(state => { state.sequence = 9999; process.kill(process.pid, 'SIGKILL'); });
  `,
    path,
  ]);
  expect(child.signal).toBe('SIGKILL');
  const recovered = createSqliteRecallStore(path);
  try {
    expect(recovered.read().sequence).not.toBe(9999);
    expect(createRecallDelta({ store: recovered, context }).observe(observation)).toEqual(receipt);
  } finally {
    recovered.close();
  }
});
