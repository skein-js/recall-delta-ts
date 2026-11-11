import {
  advanceSchema,
  batchSchema,
  closeSessionRequestSchema,
  openSessionRequestSchema,
  protocolVersion,
  type Snapshot,
  snapshotSchema,
} from './contracts.js';
import { diffCandidates } from './deltas.js';
import { type Environment, parse, RecallError } from './environment.js';
import { retainedBytes } from './policy.js';
import { recall } from './recall.js';
import { nextId } from './store.js';

export function openSession(env: Environment, input: unknown): Snapshot {
  const request = parse(openSessionRequestSchema, input);
  return env.mutate('openSession', request, snapshotSchema, (state) => {
    if (request.protocolVersion !== protocolVersion) throw new RecallError('unsupported_version');
    const expiresAt = Date.parse(request.expiresAt);
    if (expiresAt <= env.clock()) throw new RecallError('invalid_request');
    if (expiresAt > env.clock() + env.policy.sessionMs) throw new RecallError('limit_exceeded');
    const sessionId = nextId(state, 'session');
    const snapshot: Snapshot = {
      sessionId,
      engineProfile: env.engineProfile,
      version: 0,
      status: 'open',
      candidates: [],
    };
    state.sessions[sessionId] = {
      sessionId,
      scopeKey: env.scopeKey,
      principalId: env.context.principalId,
      epoch: state.epochs[env.scopeKey] ?? 0,
      expiresAt,
      snapshot,
      activation: {},
      batches: [],
      snapshots: { '0': snapshot },
    };
    return snapshot;
  });
}
export function advanceSession(env: Environment, input: unknown) {
  const request = parse(advanceSchema, input);
  if (retainedBytes(request.cues) > 8192) throw new RecallError('limit_exceeded');
  return env.mutate('advanceSession', request, batchSchema, (state) => {
    const session = env.session(state, request.sessionId, true);
    if (session.snapshot.engineProfile !== env.engineProfile)
      throw new RecallError('unsupported_feature', 'Start a session for this engine profile');
    if (session.snapshot.version !== request.expectedVersion)
      throw new RecallError('version_conflict');
    if (session.snapshot.version === Number.MAX_SAFE_INTEGER)
      throw new RecallError('limit_exceeded');
    const sources = request.evidenceIds.map((id) => env.evidence(state, id).content);
    const candidates = recall(env, state, session, [...request.cues, ...sources], request.temporal);
    const changes = diffCandidates(session.snapshot.candidates, candidates, ['cue_match']);
    const batch = batchSchema.parse({
      sessionId: session.sessionId,
      engineProfile: session.snapshot.engineProfile,
      fromVersion: session.snapshot.version,
      toVersion: session.snapshot.version + 1,
      status: 'open',
      changes,
    });
    session.snapshot = { ...session.snapshot, version: batch.toVersion, candidates };
    session.batches.push(batch);
    session.snapshots[String(batch.toVersion)] = structuredClone(session.snapshot);
    return batch;
  });
}
export function closeSession(env: Environment, input: unknown) {
  const request = parse(closeSessionRequestSchema, input);
  return env.mutate('closeSession', request, batchSchema, (state) => {
    const session = env.session(state, request.sessionId, true);
    if (session.snapshot.version !== request.expectedVersion)
      throw new RecallError('version_conflict');
    if (session.snapshot.version === Number.MAX_SAFE_INTEGER)
      throw new RecallError('limit_exceeded');
    const batch = batchSchema.parse({
      sessionId: session.sessionId,
      engineProfile: session.snapshot.engineProfile,
      fromVersion: session.snapshot.version,
      toVersion: session.snapshot.version + 1,
      status: 'closed',
      changes: [],
    });
    session.snapshot = { ...session.snapshot, status: 'closed', version: batch.toVersion };
    session.batches.push(batch);
    session.snapshots[String(batch.toVersion)] = structuredClone(session.snapshot);
    return batch;
  });
}
