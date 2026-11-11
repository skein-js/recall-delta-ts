import { expect, it } from 'vitest';

import { harness, instant, observation } from './harness.js';

it('separates admission from completion and applies delayed work once after a failed attempt', () => {
  const { client, open } = harness({ processingMode: 'deferred' });
  const source = client.observe({ ...observation('pending'), requestId: 'pending' });
  expect(client.experimental.readProcessing(source).status).toBe('pending');
  const session = open();
  expect(
    client.advanceSession({
      requestId: 'empty',
      sessionId: session.sessionId,
      expectedVersion: 0,
      cues: ['dispatch'],
      evidenceIds: [],
    }).changes,
  ).toEqual([]);
  expect(
    client.experimental.processEvidence({ ...source, requestId: 'fail', fail: true }).status,
  ).toBe('failed');
  expect(client.experimental.readProcessing(source).status).toBe('failed');
  const retry = { ...source, requestId: 'process' };
  expect(client.experimental.processEvidence(retry)).toEqual(
    client.experimental.processEvidence(retry),
  );
  expect(client.experimental.inspect().memories).toHaveLength(1);
  expect(
    client.advanceSession({
      requestId: 'ready',
      sessionId: session.sessionId,
      expectedVersion: 1,
      cues: ['dispatch'],
      evidenceIds: [],
    }).changes[0]?.type,
  ).toBe('candidate.emerged');
});

it('selects recorded knowledge before temporal validity, preserving changing-world history', () => {
  const { client, setTime, open } = harness();
  setTime(Date.parse('2026-02-01T00:00:00Z'));
  const old = client.observe({
    ...observation('a', {
      statement: 'Sam employment company A',
      validTime: { from: '2026-01-01T00:00:00Z', until: null },
    }),
    requestId: 'a',
  });
  setTime(Date.parse('2026-06-01T00:00:00Z'));
  client.observe({
    ...observation('b', {
      statement: 'Sam employment company B',
      supersedesEvidenceId: old.evidenceId,
      validTime: { from: '2026-07-01T00:00:00Z', until: null },
    }),
    requestId: 'b',
  });
  setTime(instant);
  const session = open();
  client.advanceSession({
    requestId: 'current',
    sessionId: session.sessionId,
    expectedVersion: 0,
    cues: ['Sam employment'],
    evidenceIds: [],
  });
  expect(JSON.stringify(client.readSession(session).candidates)).toContain('company B');
  expect(JSON.stringify(client.readSession(session).candidates)).not.toContain('company A');
  client.advanceSession({
    requestId: 'history',
    sessionId: session.sessionId,
    expectedVersion: 1,
    cues: ['Sam employment'],
    evidenceIds: [],
    temporal: { knownAt: '2026-05-01T00:00:00Z', validAt: '2026-08-01T00:00:00Z' },
  });
  expect(JSON.stringify(client.readSession(session).candidates)).toContain('company A');
  expect(JSON.stringify(client.readSession(session).candidates)).not.toContain('company B');
});

it('keeps protections, reconciles eviction references and reports bounded admission honestly', () => {
  const { client, setTime } = harness({ policy: { decayMs: 100, graceMs: 100, reinforce: false } });
  client.observe({ ...observation('one'), requestId: 'one' });
  client.observe({ ...observation('two', 'rare unique procedure'), requestId: 'two' });
  const [ordinary, rare] = client.experimental.inspect().memories;
  if (!ordinary || !rare) throw new Error('Expected two memories');
  client.experimental.protectMemory({
    requestId: 'value',
    memoryId: ordinary.memoryId,
    protected: false,
    retentionValue: 0.1,
  });
  client.experimental.protectMemory({
    requestId: 'pin',
    memoryId: rare.memoryId,
    protected: true,
    retentionValue: 0.1,
  });
  setTime(instant + 1000);
  expect(
    client.experimental.maintain({ requestId: 'dormancy', capacityPressure: true }).evictedIds,
  ).toEqual([]);
  setTime(instant + 1200);
  expect(
    client.experimental.maintain({ requestId: 'evict', capacityPressure: true }).evictedIds,
  ).toEqual([ordinary.memoryId]);
  expect(client.experimental.inspect().memories.map((memory) => memory.memoryId)).toEqual([
    rare.memoryId,
  ]);
  expect(client.experimental.inspect().evidence).toHaveLength(2);
  const small = harness({ policy: { hardLimitBytes: 100 } });
  expect(() => small.client.observe({ ...observation('too-large'), requestId: 'full' })).toThrow(
    'Retained logical payload capacity exhausted',
  );
  expect(small.client.experimental.inspect().evidence).toEqual([]);
});

it('does not commit a memory transaction when its result cannot cross the clone boundary', () => {
  const { store } = harness();
  const before = store.read();
  expect(() =>
    store.transact((state) => {
      state.sequence += 1;
      return () => 'uncloneable';
    }),
  ).toThrow();
  expect(store.read()).toEqual(before);
});
