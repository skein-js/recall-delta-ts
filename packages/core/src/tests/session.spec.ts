import { describe, expect, it } from 'vitest';
import { applyBatch, createRecallDelta } from '../index.js';
import { harness, instant, observation } from './harness.js';

describe('admission, versioned sessions and retries', () => {
  it('deduplicates equivalent JSON, preserves original evidence, and rejects conflicting keys', () => {
    const { client } = harness();
    const original = observation('report', { warehouse: 'north', statement: 'dispatch missing' });
    const first = client.observe({ ...original, requestId: 'one' });
    expect(
      client.observe({
        ...original,
        content: { statement: 'dispatch missing', warehouse: 'north' },
        requestId: 'two',
      }),
    ).toEqual(first);
    expect(() => client.observe({ ...original, content: 'changed', requestId: 'one' })).toThrow(
      'id_conflict',
    );
    expect(() => client.observe({ ...original, content: 'changed', requestId: 'three' })).toThrow(
      'id_conflict',
    );
    expect(client.readEvidence(first).content).toEqual(original.content);
    expect(client.experimental.inspect().memories).toHaveLength(1);
  });
  it('commits a complete batch and receipt, ignores replay, and rejects stale concurrent writes', () => {
    const { client, open } = harness();
    client.observe({ ...observation('one'), requestId: 'observation' });
    const initial = open();
    const request = {
      requestId: 'advance',
      sessionId: initial.sessionId,
      expectedVersion: 0,
      cues: ['dispatch north'],
      evidenceIds: [],
    };
    const first = client.advanceSession(request);
    const next = applyBatch(initial, first);
    expect(next.candidates).toHaveLength(1);
    expect(client.advanceSession(request)).toEqual(first);
    expect(client.readSession(initial)).toEqual(next);
    expect(() => client.advanceSession({ ...request, requestId: 'race' })).toThrow(
      'version_conflict',
    );
    expect(client.readDeltas({ sessionId: initial.sessionId, afterVersion: 0 })).toEqual({
      batches: [first],
      throughVersion: 1,
    });
    const change = first.changes[0];
    if (!change) throw new Error('Expected a change');
    const malformed = { ...first, fromVersion: 1, toVersion: 2, changes: [change, change] };
    expect(() => applyBatch(next, malformed)).toThrow();
    expect(client.readSession(initial)).toEqual(next);
    expect(applyBatch(next, first)).toEqual(next);
  });
  it('keeps candidate identity through correction and feedback private without claiming truth', () => {
    const { client, open } = harness();
    const source = client.observe({
      ...observation('old', 'dispatch posting delayed'),
      requestId: 'old',
    });
    const session = open();
    const batch = client.advanceSession({
      requestId: 'first',
      sessionId: session.sessionId,
      expectedVersion: 0,
      cues: ['dispatch posting'],
      evidenceIds: [],
    });
    const first = batch.changes.find((change) => change.type === 'candidate.emerged');
    expect(first?.type).toBe('candidate.emerged');
    if (!first || first.type !== 'candidate.emerged') throw new Error('Expected a candidate');
    const correction = client.observe({
      ...observation('fix', {
        correctsEvidenceId: source.evidenceId,
        statement: 'dispatch posting absent',
      }),
      requestId: 'fix',
    });
    const updated = client.advanceSession({
      requestId: 'second',
      sessionId: session.sessionId,
      expectedVersion: 1,
      cues: ['dispatch posting'],
      evidenceIds: [],
    });
    expect(updated.changes).toContainEqual(
      expect.objectContaining({ type: 'candidate.updated', candidateId: first.candidateId }),
    );
    expect(client.readSession(session).candidates[0]?.factualConfidence).toBeNull();
    const feedback = {
      requestId: 'feedback',
      sessionId: session.sessionId,
      candidateId: first.candidateId,
      atVersion: 2,
      kind: 'confirmed',
      evidenceIds: [correction.evidenceId],
    };
    expect(client.recordFeedback(feedback)).toEqual(client.recordFeedback(feedback));
    expect(client.experimental.inspect().feedback).toHaveLength(1);
    expect(client.readSession(session).version).toBe(2);
    expect(client.readEvidence(source).content).toBe('dispatch posting delayed');
    expect(() =>
      client.recordFeedback({ ...feedback, requestId: 'bad', evidenceIds: [] }),
    ).toThrow();
  });
  it('closes historical sets, expires active sessions and rejects profile replacement', () => {
    const { client, store, open, setTime } = harness();
    const session = open();
    const other = createRecallDelta({
      store,
      context: { tenantId: 'tenant', scopeId: 'private', principalId: 'alice' },
      clock: () => instant,
      policy: { carry: 0 },
    });
    expect(() =>
      other.advanceSession({
        requestId: 'other',
        sessionId: session.sessionId,
        expectedVersion: 0,
        cues: [],
        evidenceIds: [],
      }),
    ).toThrow();
    expect(
      client.closeSession({ requestId: 'close', sessionId: session.sessionId, expectedVersion: 0 })
        .changes,
    ).toEqual([]);
    expect(() =>
      client.advanceSession({
        requestId: 'closed',
        sessionId: session.sessionId,
        expectedVersion: 1,
        cues: [],
        evidenceIds: [],
      }),
    ).toThrow('session_closed');
    const expiring = open('expiring');
    setTime(instant + 3_600_000);
    expect(client.readSession(expiring).status).toBe('expired');
    expect(() => client.readDeltas({ sessionId: expiring.sessionId, afterVersion: 0 })).toThrow(
      'session_expired',
    );
    expect(() =>
      client.advanceSession({
        requestId: 'expired',
        sessionId: expiring.sessionId,
        expectedVersion: 0,
        cues: [],
        evidenceIds: [],
      }),
    ).toThrow('session_expired');
  });
});
