import type { RecallDeltaClient, Synchronous } from './client.js';
import {
  capabilitiesSchema,
  evidenceSchema,
  protocolCommit,
  protocolVersion,
  readDeltasRequestSchema,
  readDeltasResultSchema,
  readEvidenceRequestSchema,
  sessionRequestSchema,
  snapshotSchema,
} from './contracts.js';
import { createEnvironment, parse, RecallError, type RecallOptions } from './environment.js';
import {
  type AccountingCapability,
  type InspectionCapability,
  inspectionResultSchema,
  type ProcessingCapability,
  processingResultSchema,
  type RetentionCapability,
  type RevocationCapability,
} from './extensions.js';
import { recordFeedback } from './feedback.js';
import { maintain, protectMemory, revokeEvidence } from './maintenance.js';
import { observe, processEvidence } from './observations.js';
import { retainedBytes } from './policy.js';
import { advanceSession, closeSession, openSession } from './sessions.js';

export type RecallDeltaEngine = Synchronous<RecallDeltaClient> & {
  experimental: Synchronous<
    ProcessingCapability &
      InspectionCapability &
      AccountingCapability &
      RevocationCapability &
      RetentionCapability
  >;
};

/** In-process reference engine. Authentication belongs to the trusted host binding. */
export function createRecallDelta(options: RecallOptions): RecallDeltaEngine {
  const env = createEnvironment(options);
  function readSession(input: unknown) {
    const request = parse(sessionRequestSchema, input);
    env.grant('read');
    const session = env.session(env.store.read(), request.sessionId);
    return snapshotSchema.parse({
      ...session.snapshot,
      status:
        session.snapshot.status === 'open' && env.clock() >= session.expiresAt
          ? 'expired'
          : session.snapshot.status,
    });
  }
  return {
    describe() {
      env.grant('read');
      return capabilitiesSchema.parse({
        protocolVersions: [protocolVersion],
        protocolCommit,
        engineProfile: env.engineProfile,
        supportedScopeKinds: ['user-private', 'conversation', 'group-shared', 'tenant-shared'],
        durability: env.store.durable ? 'durable' : 'volatile',
        replayRetentionMs: env.policy.receiptMs,
        deltaHistoryMs: env.policy.sessionMs + 86_400_000,
        limits: {
          observationBytes: 65_536,
          cueBytes: 8192,
          activeCandidates: env.policy.candidateLimit,
          sessionLifetimeMs: env.policy.sessionMs,
          retainedPayloadBytes: env.policy.hardLimitBytes,
        },
        experimental: [
          'processing',
          'inspection',
          'session-invalidation',
          'temporal-query',
          'retention',
        ],
      });
    },
    observe: (input) => observe(env, input),
    readEvidence(input) {
      const request = parse(readEvidenceRequestSchema, input);
      env.grant('read');
      return evidenceSchema.parse(env.evidence(env.store.read(), request.evidenceId));
    },
    openSession: (input) => openSession(env, input),
    advanceSession: (input) => advanceSession(env, input),
    readSession,
    readDeltas(input) {
      const request = parse(readDeltasRequestSchema, input);
      env.grant('read');
      const session = env.session(env.store.read(), request.sessionId);
      if (session.snapshot.status === 'open' && env.clock() >= session.expiresAt)
        throw new RecallError('session_expired');
      if (request.afterVersion > session.snapshot.version) throw new RecallError('invalid_request');
      const batches = session.batches
        .filter((batch) => batch.toVersion > request.afterVersion)
        .slice(0, 16);
      if (!batches.length && request.afterVersion < session.snapshot.version)
        throw new RecallError('resync_required');
      if (batches.length && batches[0]?.fromVersion !== request.afterVersion)
        throw new RecallError('resync_required');
      for (const batch of batches)
        for (const change of batch.changes) {
          const candidate =
            change.type !== 'candidate.withdrawn'
              ? change.current
              : session.snapshots[String(batch.fromVersion)]?.candidates.find(
                  (candidate) => candidate.candidateId === change.candidateId,
                );
          candidate?.evidenceRefs.forEach((ref) => env.evidence(env.store.read(), ref.evidenceId));
        }
      return readDeltasResultSchema.parse({
        batches,
        throughVersion: batches.at(-1)?.toVersion ?? request.afterVersion,
      });
    },
    recordFeedback: (input) => recordFeedback(env, input),
    closeSession: (input) => closeSession(env, input),
    experimental: {
      processEvidence: (input) => processEvidence(env, input),
      readProcessing(input) {
        const request = parse(readEvidenceRequestSchema, input);
        env.grant('read');
        const state = env.store.read();
        env.evidence(state, request.evidenceId);
        const status = state.processing[request.evidenceId];
        if (!status) throw new RecallError('evidence_unavailable');
        return processingResultSchema.parse(status);
      },
      inspect() {
        env.grant('read');
        const state = env.store.read();
        return inspectionResultSchema.parse({
          evidence: Object.values(state.evidence).filter((record) =>
            env.canRead(state, record.evidenceId),
          ),
          memories: Object.values(state.memories).filter(
            (memory) =>
              memory.scopeKey === env.scopeKey &&
              memory.versions.every((version) =>
                version.evidenceIds.every((id) => env.canRead(state, id)),
              ),
          ),
          processing: Object.values(state.processing).filter((record) =>
            env.canRead(state, record.evidenceId),
          ),
          feedback: state.feedback.filter(
            (record) =>
              record.scopeKey === env.scopeKey &&
              record.principalId === env.context.principalId &&
              state.sessions[record.sessionId]?.snapshots[
                String(record.atVersion)
              ]?.candidates.some(
                (candidate) =>
                  candidate.candidateId === record.candidateId &&
                  candidate.evidenceRefs.every((ref) => env.canRead(state, ref.evidenceId)),
              ),
          ),
        });
      },
      accounting() {
        env.grant('maintain');
        if (!env.allowGlobalAccounting)
          throw new RecallError(
            'unsupported_feature',
            'Global accounting requires an explicit operator capability',
          );
        const state = env.store.read();
        return {
          retainedPayloadBytes: retainedBytes(state),
          hardLimitBytes: env.policy.hardLimitBytes,
          boundary:
            'canonical UTF-8 application payload, including evidence, memories, history, receipts, learning and eviction records',
        };
      },
      revokeEvidence: (input) => revokeEvidence(env, input),
      protectMemory: (input) => protectMemory(env, input),
      maintain: (input) => maintain(env, input),
    },
  };
}
