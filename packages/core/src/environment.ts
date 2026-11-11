import { z } from 'zod';

import {
  type CallerContext,
  candidateSchema,
  changeSchema,
  contextSchema,
  type Evidence as PublicEvidence,
  jsonSchema,
  type ScopeGrant,
  scopeGrantSchema,
} from './contracts.js';
import {
  canonical,
  createEngineProfile,
  defaultPolicy,
  type MemoryPolicy,
  policySchema,
  retainedBytes,
} from './policy.js';
import type { Evidence, RecallStore, SessionRecord, StoreState } from './store.js';

export class RecallError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'RecallError';
  }
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new RecallError('invalid_request', 'Input does not satisfy the contract');
  return result.data;
}
export interface RecallOptions {
  store: RecallStore;
  /** Trusted host binding, never inferred from a cue, observation, or model argument. */
  context: CallerContext;
  grant?: () => ScopeGrant;
  clock?: () => number;
  policy?: Partial<MemoryPolicy>;
  processingMode?: 'inline' | 'deferred';
  /** Explicit trusted operator capability; reveals the whole store's aggregate size. */
  allowGlobalAccounting?: boolean;
  canReadEvidence?: (evidence: PublicEvidence, context: CallerContext) => boolean;
}
export function createEnvironment(options: RecallOptions) {
  const context = parse(contextSchema, options.context);
  const policy = parse(policySchema, { ...defaultPolicy, ...options.policy });
  const scopeKey = canonical([context.tenantId, context.scopeId]);
  const clock = options.clock ?? Date.now;
  function scopeBinding(state: StoreState, access: ScopeGrant) {
    const expected = {
      tenantId: context.tenantId,
      scopeId: context.scopeId,
      kind: access.kind,
      ownerId: access.kind === 'user-private' ? context.principalId : null,
    };
    const existing = state.scopes[scopeKey];
    if (existing && canonical(existing) !== canonical(expected))
      throw new RecallError('scope_unavailable');
    return existing ?? expected;
  }
  function grant(
    action: 'read' | 'write' | 'maintain' | 'feedback',
    state = options.store.read(),
  ): ScopeGrant {
    const access = parse(
      scopeGrantSchema,
      options.grant === undefined
        ? {
            kind: 'user-private',
            feedbackWriters: [context.principalId],
            readers: [context.principalId],
            writers: [context.principalId],
            maintainers: [context.principalId],
          }
        : options.grant(),
    );
    const permitted =
      action === 'read'
        ? access.readers
        : action === 'write'
          ? access.writers
          : action === 'feedback'
            ? access.feedbackWriters
            : access.maintainers;
    if (!permitted.includes(context.principalId)) throw new RecallError('scope_unavailable');
    scopeBinding(state, access);
    return access;
  }
  function evidence(state: StoreState, evidenceId: string): Evidence {
    const access = grant('read', state),
      record = state.evidence[evidenceId];
    if (
      !record ||
      !state.scopes[scopeKey] ||
      record.scopeKey !== scopeKey ||
      record.revoked ||
      (access.kind === 'user-private' && record.principalId !== context.principalId) ||
      (options.canReadEvidence && options.canReadEvidence(record, context) !== true)
    )
      throw new RecallError('evidence_unavailable');
    return record;
  }
  function canRead(state: StoreState, evidenceId: string): boolean {
    try {
      evidence(state, evidenceId);
      return true;
    } catch (error) {
      if (error instanceof RecallError) return false;
      throw error;
    }
  }
  function session(state: StoreState, sessionId: string, requireOpen = false): SessionRecord {
    grant('read', state);
    const record = state.sessions[sessionId];
    if (
      !record ||
      !state.scopes[scopeKey] ||
      record.scopeKey !== scopeKey ||
      record.principalId !== context.principalId ||
      record.epoch !== (state.epochs[scopeKey] ?? 0)
    )
      throw new RecallError('session_unavailable');
    if (
      !record.snapshot.candidates.every((candidate) =>
        candidate.evidenceRefs.every((ref) => canRead(state, ref.evidenceId)),
      )
    )
      throw new RecallError('session_unavailable');
    if (requireOpen && clock() >= record.expiresAt) throw new RecallError('session_expired');
    if (requireOpen && record.snapshot.status !== 'open') throw new RecallError('session_closed');
    return record;
  }
  function mutate<T>(
    operation: string,
    input: { requestId: string },
    schema: z.ZodType<T>,
    execute: (state: StoreState) => T,
  ): T {
    const access = grant(
      operation === 'observe' ? 'write' : operation === 'recordFeedback' ? 'feedback' : 'read',
    );
    return options.store.transact((state) => {
      state.scopes[scopeKey] = scopeBinding(state, access);
      const now = clock(),
        epoch = state.epochs[scopeKey] ?? 0;
      for (const [key, receipt] of Object.entries(state.receipts))
        if (receipt.expiresAt <= now) delete state.receipts[key];
      const key = canonical([scopeKey, context.principalId, operation, input.requestId]);
      const receipt = state.receipts[key],
        payload = canonical(input);
      if (receipt) {
        if (receipt.epoch !== epoch) throw new RecallError('session_unavailable');
        if (receipt.payload !== payload) throw new RecallError('id_conflict');
        const disclosure = z
          .object({
            evidenceId: z.string().optional(),
            sessionId: z.string().optional(),
            fromVersion: z.number().optional(),
            candidates: z.array(candidateSchema).optional(),
            changes: z.array(changeSchema).optional(),
          })
          .parse(receipt.result);
        if (disclosure.evidenceId) evidence(state, disclosure.evidenceId);
        for (const candidate of disclosure.candidates ?? [])
          candidate.evidenceRefs.forEach((ref) => evidence(state, ref.evidenceId));
        for (const change of disclosure.changes ?? []) {
          const candidate =
            change.type !== 'candidate.withdrawn'
              ? change.current
              : state.sessions[disclosure.sessionId ?? '']?.snapshots[
                  String(disclosure.fromVersion)
                ]?.candidates.find((candidate) => candidate.candidateId === change.candidateId);
          candidate?.evidenceRefs.forEach((ref) => evidence(state, ref.evidenceId));
        }
        return parse(schema, receipt.result);
      }
      const result = parse(schema, execute(state));
      state.receipts[key] = {
        scopeKey,
        payload,
        result: jsonSchema.parse(result),
        expiresAt: now + policy.receiptMs,
        epoch: state.epochs[scopeKey] ?? 0,
      };
      if (retainedBytes(state) > policy.hardLimitBytes)
        throw new RecallError('limit_exceeded', 'Retained logical payload capacity exhausted');
      return result;
    });
  }
  return {
    ...options,
    context,
    scopeKey,
    clock,
    policy,
    grant,
    evidence,
    canRead,
    session,
    mutate,
    engineProfile: createEngineProfile(policy),
  };
}
export type Environment = ReturnType<typeof createEnvironment>;
