import { expect, it } from 'vitest';

import { harness, instant, observation } from './harness.js';

it('corrects the successor interpretation while preserving its predecessor and candidate identity', () => {
  const { client, setTime, open } = harness();
  const a = client.observe({
    ...observation('a', {
      statement: 'dispatch north old procedure',
      validTime: { from: new Date(instant - 1000).toISOString(), until: null },
    }),
    requestId: 'a',
  });
  setTime(instant + 1000);
  const b = client.observe({
    ...observation('b', {
      statement: 'dispatch north new procedure',
      supersedesEvidenceId: a.evidenceId,
      validTime: { from: new Date(instant + 1000).toISOString(), until: null },
    }),
    requestId: 'b',
  });
  const [predecessor, successor] = client.experimental.inspect().memories;
  if (!predecessor || !successor) throw new Error('Expected two interpretations');
  const session = open();
  client.advanceSession({
    requestId: 'first',
    sessionId: session.sessionId,
    expectedVersion: 0,
    cues: ['dispatch north'],
    evidenceIds: [],
  });
  const candidateId = client.readSession(session).candidates[0]?.candidateId;
  setTime(instant + 2000);
  const c = client.observe({
    ...observation('c', {
      statement: 'dispatch north corrected procedure',
      correctsEvidenceId: b.evidenceId,
    }),
    requestId: 'c',
  });
  const after = client.experimental.inspect().memories;
  expect(after.find((memory) => memory.memoryId === predecessor.memoryId)).toEqual(predecessor);
  expect(
    after.find((memory) => memory.memoryId === successor.memoryId)?.versions.at(-1),
  ).toMatchObject({
    interpretationEvidenceId: c.evidenceId,
    content: { statement: 'dispatch north corrected procedure' },
    validTime: { from: new Date(instant + 1000).toISOString(), until: null },
  });
  const batch = client.advanceSession({
    requestId: 'second',
    sessionId: session.sessionId,
    expectedVersion: 1,
    cues: ['dispatch north'],
    evidenceIds: [],
  });
  expect(batch.changes).toContainEqual(
    expect.objectContaining({ type: 'candidate.updated', candidateId }),
  );
  expect(client.readSession(session).candidates[0]?.content).toMatchObject({
    statement: 'dispatch north corrected procedure',
  });
  expect(client.readEvidence(b).content).toMatchObject({
    statement: 'dispatch north new procedure',
  });
  client.observe({
    ...observation('d', {
      statement: 'dispatch north follow-up correction',
      correctsEvidenceId: c.evidenceId,
    }),
    requestId: 'd',
  });
  expect(client.experimental.inspect().memories).toHaveLength(2);
});

it('rejects missing or ambiguous interpretation targets atomically', () => {
  for (const ambiguous of [false, true]) {
    const { client, store } = harness();
    const source = client.observe({ ...observation('source'), requestId: 'source' });
    store.transact((state) => {
      const memory = Object.values(state.memories)[0];
      if (!memory) throw new Error('Missing interpretation');
      if (ambiguous)
        state.memories['duplicate'] = { ...structuredClone(memory), memoryId: 'duplicate' };
      else delete state.memories[memory.memoryId];
    });
    const before = store.read();
    expect(() =>
      client.observe({
        ...observation('correction', {
          statement: 'corrected',
          correctsEvidenceId: source.evidenceId,
        }),
        requestId: 'correction',
      }),
    ).toThrowError(expect.objectContaining({ code: 'evidence_unavailable' }));
    expect(store.read()).toEqual(before);
  }
});
