import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecallDelta, type ObserveRequest } from '@skein-js/recall-delta';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

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
const observation: ObserveRequest = {
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

it('preserves scope ownership and interpretation targets after reopening', () => {
  const path = filename();
  let store = createSqliteRecallStore(path);
  const a = createRecallDelta({ store, context });
  const source = a.observe(observation);
  const successor = a.observe({
    ...observation,
    requestId: 'successor',
    observationId: 'successor',
    content: {
      statement: 'new dispatch procedure',
      supersedesEvidenceId: source.evidenceId,
      validTime: { from: '2026-12-01T00:00:00Z', until: null },
    },
  });
  const before = a.experimental.inspect().memories;
  store.close();
  store = createSqliteRecallStore(path);
  try {
    const recovered = createRecallDelta({ store, context });
    expect(recovered.experimental.inspect().memories).toEqual(before);
    recovered.observe({
      ...observation,
      requestId: 'fix',
      observationId: 'fix',
      content: { statement: 'corrected successor', correctsEvidenceId: successor.evidenceId },
    });
    const after = recovered.experimental.inspect().memories;
    expect(after[0]).toEqual(before[0]);
    expect(after[1]?.versions.at(-1)?.content).toMatchObject({ statement: 'corrected successor' });
    const bob = createRecallDelta({
      store,
      context: { ...context, principalId: 'bob' },
      grant: () => ({
        kind: 'group-shared',
        readers: ['bob'],
        writers: [],
        feedbackWriters: [],
        maintainers: [],
      }),
    });
    expect(() => bob.readEvidence(source)).toThrow('scope_unavailable');
  } finally {
    store.close();
  }
});

it('rejects legacy storage explicitly without rewriting its audience-ambiguous payload', () => {
  const path = filename();
  const legacy = new Database(path);
  const payload = JSON.stringify({
    schemaVersion: 1,
    evidence: { original: 'retained legacy data' },
  });
  legacy.exec(
    'CREATE TABLE recall_state (id INTEGER PRIMARY KEY CHECK (id=1), schema_version INTEGER NOT NULL CHECK (schema_version=1), payload TEXT NOT NULL)',
  );
  legacy.prepare('INSERT INTO recall_state VALUES (1, 1, ?)').run(payload);
  legacy.close();
  expect(() => createSqliteRecallStore(path)).toThrow('Unsupported Recall Delta storage schema');
  const preserved = new Database(path, { readonly: true });
  try {
    expect(preserved.prepare('SELECT payload FROM recall_state WHERE id=1').get()).toEqual({
      payload,
    });
  } finally {
    preserved.close();
  }
});
