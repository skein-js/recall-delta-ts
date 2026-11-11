import assert from 'node:assert/strict';
import {
  createMemoryRecallStore,
  createRecallDelta,
  protocolVersion,
} from '@skein-js/recall-delta';
import { makeWarehouseGraph } from '../graph.js';
import { report } from '../scenario.js';

export async function runMechanics() {
  let now = Date.parse('2026-11-11T10:00:00Z');
  const store = createMemoryRecallStore();
  const memory = createRecallDelta({
    store,
    context: { tenantId: 'mechanics', scopeId: 'private', principalId: 'alice' },
    clock: () => now,
    processingMode: 'deferred',
    allowGlobalAccounting: true,
    policy: { decayMs: 100, graceMs: 100 },
  });
  const source = memory.observe({
    ...report('old', 'south', 'delayed-posting', 'wait-for-job'),
    requestId: 'old',
  });
  assert.equal(memory.experimental.readProcessing(source).status, 'pending');
  assert.equal(
    memory.experimental.processEvidence({ ...source, requestId: 'fail', fail: true }).status,
    'failed',
  );
  const process = { ...source, requestId: 'process' };
  memory.experimental.processEvidence(process);
  memory.experimental.processEvidence(process);
  assert.equal(memory.experimental.inspect().memories.length, 1);
  const graph = makeWarehouseGraph({ memory: () => memory, mode: 'associative', clock: () => now });
  const input = {
    runId: 'first',
    observations: [],
    cues: ['south dispatch ERP stock discrepancy'],
    system: {
      warehouse: 'south',
      dispatchPosted: false,
      erpUpdated: false,
      postingJob: 'pending' as const,
    },
  };
  const first = await graph.invoke(input);
  assert.equal(first.actionCommitted, true);
  const corrected = await graph.invoke({
    ...input,
    runId: 'corrected',
    view: first.view,
    observations: [
      {
        ...report('correction', 'south', 'missing-posting', 'post-dispatch'),
        content: {
          warehouse: 'south',
          diagnosis: 'missing-posting',
          action: 'post-dispatch',
          correctsEvidenceId: source.evidenceId,
        },
      },
    ],
    system: { ...input.system, postingJob: 'missing' as const },
  });
  assert.equal(corrected.plan?.diagnosis, 'missing-posting');
  assert.equal(corrected.actionCommitted, true);
  assert.ok(corrected.view.assumptions.some((entry) => entry.status === 'stale'));
  const session = memory.openSession({
    requestId: 'replay-session',
    protocolVersion,
    taskRef: 'replay',
    expiresAt: new Date(now + 10000).toISOString(),
  });
  const request = {
    requestId: 'replay',
    sessionId: session.sessionId,
    expectedVersion: 0,
    cues: ['south'],
    evidenceIds: [],
  };
  memory.advanceSession(request);
  const beforeReplay = memory.experimental.inspect().memories;
  memory.advanceSession(request);
  assert.deepEqual(memory.experimental.inspect().memories, beforeReplay);
  const inspected = memory.experimental.inspect();
  assert.ok(
    inspected.memories.every((record) =>
      record.versions.every((version) =>
        version.evidenceIds.every((id) =>
          inspected.evidence.some((evidence) => evidence.evidenceId === id),
        ),
      ),
    ),
  );
  const correctionSource = inspected.evidence.find(
    (record) => record.observationId === 'correction',
  );
  assert.ok(correctionSource);
  memory.experimental.revokeEvidence({
    requestId: 'revoke',
    evidenceId: correctionSource.evidenceId,
  });
  assert.throws(
    () => memory.readSession({ sessionId: corrected.view.snapshot?.sessionId }),
    /session_unavailable/,
  );
  const recovered = await graph.invoke({
    ...input,
    runId: 'revoked',
    observations: [],
    view: corrected.view,
    system: { ...input.system, postingJob: 'missing' as const },
  });
  assert.equal(recovered.plan?.diagnosis, 'missing-posting');
  assert.deepEqual(recovered.plan?.basedOn, []);
  assert.equal(recovered.actionCommitted, true);
  now += 1000;
  memory.experimental.maintain({ requestId: 'dormant', capacityPressure: true });
  const capacity = memory.experimental.accounting();
  assert.ok(capacity.retainedPayloadBytes <= capacity.hardLimitBytes);
  return {
    dependenciesInvalidated: true,
    revisedWithinOneDecision: true,
    staleActionsCommitted: 0,
    readiness: ['pending', 'failed', 'completed'],
    replayDuplicateEffects: 0,
    lineageComplete: true,
    revocationReauthorized: true,
    logicalPayloadBytes: capacity.retainedPayloadBytes,
    limits: [
      'No LLM quality or general security claim',
      'Raw operator-owned Skein checkpoint history has a separate retention boundary',
    ],
  };
}
