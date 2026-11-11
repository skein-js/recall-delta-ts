import { observationSchema, observeReceiptSchema, observeRequestSchema } from './contracts.js';
import { type Environment, parse, RecallError } from './environment.js';
import { processEvidenceRequestSchema, processEvidenceResultSchema } from './extensions.js';
import { formMemory } from './formation.js';
import { canonical, retainedBytes } from './policy.js';
import { nextId } from './store.js';

export function observe(env: Environment, input: unknown) {
  const request = parse(observeRequestSchema, input);
  if (retainedBytes(request) > 65_536) throw new RecallError('limit_exceeded');
  return env.mutate('observe', request, observeReceiptSchema, (state) => {
    const observation = observationSchema.parse(request);
    const existing = Object.values(state.evidence).find(
      (record) =>
        record.scopeKey === env.scopeKey && record.observationId === request.observationId,
    );
    if (existing) {
      env.evidence(state, existing.evidenceId);
      if (canonical(observationSchema.parse(existing)) !== canonical(observation))
        throw new RecallError('id_conflict');
      return { evidenceId: existing.evidenceId };
    }
    const evidenceId = nextId(state, 'evidence');
    const record = {
      ...observation,
      evidenceId,
      scopeKey: env.scopeKey,
      principalId: env.context.principalId,
      recordedAt: new Date(env.clock()).toISOString(),
      revoked: false,
    };
    state.evidence[evidenceId] = record;
    state.processing[evidenceId] = {
      evidenceId,
      scopeKey: env.scopeKey,
      status: 'pending',
      error: null,
    };
    if (env.processingMode !== 'deferred') {
      formMemory(env, state, record);
      state.processing[evidenceId] = {
        evidenceId,
        scopeKey: env.scopeKey,
        status: 'completed',
        error: null,
      };
    }
    return { evidenceId };
  });
}
export function processEvidence(env: Environment, input: unknown) {
  const request = parse(processEvidenceRequestSchema, input);
  env.grant('write');
  return env.mutate('processEvidence', request, processEvidenceResultSchema, (state) => {
    const record = env.evidence(state, request.evidenceId),
      prior = state.processing[record.evidenceId];
    if (prior?.status === 'completed')
      return { evidenceId: record.evidenceId, status: 'completed' as const, error: null };
    if (request.fail) {
      state.processing[record.evidenceId] = {
        evidenceId: record.evidenceId,
        scopeKey: env.scopeKey,
        status: 'failed',
        error: 'Injected processing failure',
      };
      return {
        evidenceId: record.evidenceId,
        status: 'failed' as const,
        error: 'Injected processing failure',
      };
    }
    formMemory(env, state, record);
    state.processing[record.evidenceId] = {
      evidenceId: record.evidenceId,
      scopeKey: env.scopeKey,
      status: 'completed',
      error: null,
    };
    return { evidenceId: record.evidenceId, status: 'completed' as const, error: null };
  });
}
