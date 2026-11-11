import { expect, it } from 'vitest';

import { protocolVersion, type RecallDeltaClient } from '../index.js';
import { harness, instant, observation } from './harness.js';

it('supports an asynchronous core-only client through the nine operations', async () => {
  const { client: engine } = harness();
  const client: RecallDeltaClient = {
    describe: async () => engine.describe(),
    observe: async (request) => engine.observe(request),
    readEvidence: async (request) => engine.readEvidence(request),
    openSession: async (request) => engine.openSession(request),
    advanceSession: async (request) => engine.advanceSession(request),
    readSession: async (request) => engine.readSession(request),
    readDeltas: async (request) => engine.readDeltas(request),
    recordFeedback: async (request) => engine.recordFeedback(request),
    closeSession: async (request) => engine.closeSession(request),
  };
  expect('experimental' in client).toBe(false);
  const capabilities = await client.describe();
  const durability: 'durable' | 'volatile' = capabilities.durability;
  expect(durability).toBe('volatile');
  const receipt = await client.observe({ ...observation('source'), requestId: 'source' });
  const evidence = await client.readEvidence(receipt);
  expect(evidence.content).toEqual(observation('source').content);
  expect('scopeKey' in evidence).toBe(false);
  const session = await client.openSession({
    requestId: 'open',
    protocolVersion,
    taskRef: 'task',
    expiresAt: new Date(instant + 10000).toISOString(),
  });
  await client.advanceSession({
    requestId: 'advance',
    sessionId: session.sessionId,
    expectedVersion: 0,
    cues: ['dispatch'],
    evidenceIds: [],
  });
  const snapshot = await client.readSession(session);
  const candidate = snapshot.candidates[0];
  if (!candidate) throw new Error('Expected a candidate');
  expect(
    (await client.readDeltas({ sessionId: session.sessionId, afterVersion: 0 })).throughVersion,
  ).toBe(1);
  expect(
    (
      await client.recordFeedback({
        requestId: 'feedback',
        sessionId: session.sessionId,
        candidateId: candidate.candidateId,
        atVersion: 1,
        kind: 'useful',
        evidenceIds: [],
      })
    ).status,
  ).toBe('recorded');
  expect(
    (
      await client.closeSession({
        requestId: 'close',
        sessionId: session.sessionId,
        expectedVersion: 1,
      })
    ).status,
  ).toBe('closed');
});
