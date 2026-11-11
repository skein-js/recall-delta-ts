import { expect, it } from 'vitest';

import { createRecallDelta } from '../index.js';
import { harness, instant, observation } from './harness.js';

it('excludes another private owner before recall and keeps sessions caller-owned in shared scopes', () => {
  const { client: alice, store } = harness();
  const source = alice.observe({ ...observation('private'), requestId: 'alice' });
  const bob = createRecallDelta({
    store,
    context: { tenantId: 'tenant', scopeId: 'private', principalId: 'bob' },
    clock: () => instant,
  });
  expect(() => bob.readEvidence(source)).toThrow('scope_unavailable');
  expect(() => bob.experimental.inspect()).toThrow('scope_unavailable');
  const grant = () => ({
    kind: 'group-shared' as const,
    feedbackWriters: ['alice'],
    readers: ['alice', 'bob'],
    writers: ['alice'],
    maintainers: ['alice'],
  });
  const sharedAlice = createRecallDelta({
    store,
    context: { tenantId: 'tenant', scopeId: 'team', principalId: 'alice' },
    grant,
    clock: () => instant,
    policy: { carry: 0, reinforce: false },
  });
  const sharedBob = createRecallDelta({
    store,
    context: { tenantId: 'tenant', scopeId: 'team', principalId: 'bob' },
    grant,
    clock: () => instant,
    policy: { carry: 0, reinforce: false },
  });
  sharedAlice.observe({ ...observation('shared'), requestId: 'shared' });
  const open = (user: typeof sharedAlice, key: string) =>
    user.openSession({
      requestId: key,
      protocolVersion: '0.1-draft.4',
      taskRef: 'task',
      expiresAt: new Date(instant + 10000).toISOString(),
    });
  const a = open(sharedAlice, 'a'),
    b = open(sharedBob, 'b');
  expect(() => sharedBob.readSession(a)).toThrow('session_unavailable');
  expect(() => sharedBob.observe({ ...observation('no-write'), requestId: 'denied' })).toThrow(
    'scope_unavailable',
  );
  const advance = (user: typeof sharedAlice, sessionId: string, version: number) =>
    user.advanceSession({
      requestId: `advance-${version}`,
      sessionId,
      expectedVersion: version,
      cues: ['dispatch north'],
      evidenceIds: [],
    });
  advance(sharedAlice, a.sessionId, 0);
  advance(sharedBob, b.sessionId, 0);
  const before = sharedBob.readSession(b).candidates;
  const candidate = sharedAlice.readSession(a).candidates[0];
  if (!candidate) throw new Error('Missing candidate');
  sharedAlice.recordFeedback({
    requestId: 'private-feedback',
    sessionId: a.sessionId,
    candidateId: candidate.candidateId,
    atVersion: 1,
    kind: 'useful',
    evidenceIds: [],
  });
  advance(sharedBob, b.sessionId, 1);
  expect(sharedBob.readSession(b).candidates).toEqual(before);
  expect(sharedBob.experimental.inspect().feedback).toEqual([]);
});

it('revokes cached history/receipts and erases derivatives without damaging another scope retry', () => {
  const { client, store, open } = harness();
  const source = client.observe({
    ...observation('secret', 'secret dispatch report'),
    requestId: 'source',
  });
  const session = open();
  const request = {
    requestId: 'advance',
    sessionId: session.sessionId,
    expectedVersion: 0,
    cues: ['dispatch'],
    evidenceIds: [],
  };
  client.advanceSession(request);
  const other = createRecallDelta({
    store,
    context: { tenantId: 'other', scopeId: 'other', principalId: 'bob' },
    clock: () => instant,
  });
  const otherRequest = { ...observation('other'), requestId: 'other' },
    otherReceipt = other.observe(otherRequest);
  client.experimental.revokeEvidence({
    requestId: 'erase',
    evidenceId: source.evidenceId,
    erase: true,
  });
  expect(() => client.readSession(session)).toThrow('session_unavailable');
  expect(() => client.advanceSession(request)).toThrow('session_unavailable');
  expect(() => client.readDeltas({ sessionId: session.sessionId, afterVersion: 0 })).toThrow(
    'session_unavailable',
  );
  expect(() => client.readEvidence(source)).toThrow('evidence_unavailable');
  expect(client.experimental.inspect().memories).toEqual([]);
  expect(JSON.stringify(store.read())).not.toContain('secret dispatch report');
  expect(other.observe(otherRequest)).toEqual(otherReceipt);
});

it('rechecks narrower source policy for historical output, feedback and receipts without interpreting content keys as authority', () => {
  const base = harness();
  let denied = '';
  const client = createRecallDelta({
    store: base.store,
    context: { tenantId: 'tenant', scopeId: 'private', principalId: 'alice' },
    clock: () => instant,
    policy: { carry: 0, spread: 0, reinforce: false },
    canReadEvidence: (record) => record.evidenceId !== denied,
  });
  const source = client.observe({
    ...observation('source', { evidenceId: 'ordinary-content-key', statement: 'alpha dispatch' }),
    requestId: 'source',
  });
  client.observe({ ...observation('other', 'beta garden'), requestId: 'other' });
  const session = client.openSession({
    requestId: 'session',
    protocolVersion: '0.1-draft.4',
    taskRef: 'task',
    expiresAt: new Date(instant + 10000).toISOString(),
  });
  const request = {
    requestId: 'first',
    sessionId: session.sessionId,
    expectedVersion: 0,
    cues: ['alpha dispatch'],
    evidenceIds: [],
  };
  const batch = client.advanceSession(request);
  expect(client.advanceSession(request)).toEqual(batch);
  const candidate = client.readSession(session).candidates[0];
  if (!candidate) throw new Error('Missing source candidate');
  client.advanceSession({
    requestId: 'next',
    sessionId: session.sessionId,
    expectedVersion: 1,
    cues: ['beta garden'],
    evidenceIds: [],
  });
  denied = source.evidenceId;
  expect(client.readSession(session).candidates).toHaveLength(1);
  expect(() => client.advanceSession(request)).toThrow('evidence_unavailable');
  expect(() => client.readDeltas({ sessionId: session.sessionId, afterVersion: 0 })).toThrow(
    'evidence_unavailable',
  );
  expect(() =>
    client.recordFeedback({
      requestId: 'feedback',
      sessionId: session.sessionId,
      candidateId: candidate.candidateId,
      atVersion: 1,
      kind: 'useful',
      evidenceIds: [],
    }),
  ).toThrow('evidence_unavailable');
});

it('keeps erasure inside its exact scoped memory tuple when a different principal name equals the removed memory ID', () => {
  const { client: alice, store } = harness();
  const source = alice.observe({ ...observation('erase-me'), requestId: 'erase-me' });
  const removedId = alice.experimental.inspect().memories[0]?.memoryId;
  if (!removedId) throw new Error('Missing memory');
  const other = createRecallDelta({
    store,
    context: { tenantId: 'other', scopeId: 'other', principalId: removedId },
    clock: () => instant,
    policy: { carry: 0, spread: 0, reinforce: false },
  });
  other.observe({ ...observation('other'), requestId: 'other' });
  const session = other.openSession({
    requestId: 'open',
    protocolVersion: '0.1-draft.4',
    taskRef: 'other',
    expiresAt: new Date(instant + 10000).toISOString(),
  });
  const advance = (version: number) =>
    other.advanceSession({
      requestId: `advance-${version}`,
      sessionId: session.sessionId,
      expectedVersion: version,
      cues: ['dispatch north'],
      evidenceIds: [],
    });
  advance(0);
  const candidate = other.readSession(session).candidates[0];
  if (!candidate) throw new Error('Missing other candidate');
  other.recordFeedback({
    requestId: 'useful',
    sessionId: session.sessionId,
    candidateId: candidate.candidateId,
    atVersion: 1,
    kind: 'useful',
    evidenceIds: [],
  });
  advance(1);
  const before = other.readSession(session).candidates;
  alice.experimental.revokeEvidence({
    requestId: 'erase',
    evidenceId: source.evidenceId,
    erase: true,
  });
  advance(2);
  expect(other.readSession(session).candidates).toEqual(before);
});
