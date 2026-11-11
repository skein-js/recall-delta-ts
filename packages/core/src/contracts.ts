import { z } from 'zod';

import { compareInstants } from './time.js';

export const protocolVersion = '0.1-draft.4';
export const protocolCommit = '88f346269e1adaac50ccaebbdfc0a1257b3f8097';
export const jsonSchema = z.json();
export type Json = z.infer<typeof jsonSchema>;
export const idSchema = z.string().min(1).max(512);
export const timeSchema = z.iso.datetime({ offset: false });
export const versionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const estimate = z.number().min(0).max(1).nullable();
export const validTimeSchema = z
  .object({ from: timeSchema.nullable(), until: timeSchema.nullable() })
  .refine(
    (value) => !value.from || !value.until || compareInstants(value.from, value.until) < 0,
    'Invalid validity interval',
  );
export const observationSchema = z.object({
  observationId: idSchema,
  kind: z.enum(['message', 'tool-result', 'document', 'event', 'state-change']),
  content: jsonSchema,
  observedAt: timeSchema,
  source: z.object({ type: idSchema, id: idSchema, uri: z.string().optional() }),
});
export const candidateSchema = z
  .object({
    candidateId: idSchema,
    memoryRefs: z.array(idSchema),
    content: jsonSchema,
    activation: z.number().min(0).max(1),
    relevance: estimate,
    validTime: validTimeSchema.nullable().optional(),
    factualConfidence: estimate,
    uncertainty: z.object({
      ambiguity: estimate,
      contradiction: estimate,
      sourceDoubt: estimate,
      missingContext: estimate,
    }),
    evidenceRefs: z
      .array(
        z.object({ evidenceId: idSchema, role: z.enum(['supports', 'contradicts', 'context']) }),
      )
      .min(1),
    verification: z.enum(['required', 'unspecified']),
  })
  .refine(
    (value) => value.evidenceRefs.some((ref) => ref.role !== 'contradicts'),
    'Missing contextual/supporting source',
  );
const reasonCodes = z.array(idSchema).min(1);
export const changeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('candidate.emerged'),
    candidateId: idSchema,
    current: candidateSchema,
    reasonCodes,
  }),
  z.object({
    type: z.literal('candidate.updated'),
    candidateId: idSchema,
    current: candidateSchema,
    reasonCodes,
  }),
  z.object({ type: z.literal('candidate.withdrawn'), candidateId: idSchema, reasonCodes }),
]);
export const batchSchema = z.object({
  sessionId: idSchema,
  engineProfile: idSchema,
  fromVersion: versionSchema,
  toVersion: versionSchema,
  status: z.enum(['open', 'closed']),
  changes: z.array(changeSchema),
});
export const snapshotSchema = z.object({
  sessionId: idSchema,
  engineProfile: idSchema,
  version: versionSchema,
  status: z.enum(['open', 'closed', 'expired']),
  candidates: z.array(candidateSchema),
});
export const contextSchema = z.object({
  tenantId: idSchema,
  scopeId: idSchema,
  principalId: idSchema,
});
export const scopeKindSchema = z.enum([
  'user-private',
  'conversation',
  'group-shared',
  'tenant-shared',
]);
export const scopeGrantSchema = z.object({
  kind: scopeKindSchema,
  feedbackWriters: z.array(idSchema).default([]),
  readers: z.array(idSchema),
  writers: z.array(idSchema),
  maintainers: z.array(idSchema),
});
export const mutationSchema = z.object({ requestId: idSchema });
export const sessionRequestSchema = z.object({ sessionId: idSchema });
export const advanceSchema = mutationSchema.extend({
  sessionId: idSchema,
  expectedVersion: versionSchema,
  cues: z.array(jsonSchema),
  evidenceIds: z.array(idSchema),
  temporal: z.object({ validAt: timeSchema, knownAt: timeSchema }).optional(),
});
export const feedbackSchema = mutationSchema
  .extend({
    sessionId: idSchema,
    candidateId: idSchema,
    atVersion: versionSchema,
    kind: z.enum(['confirmed', 'rejected', 'corrected', 'useful', 'independently_supported']),
    evidenceIds: z.array(idSchema),
    explanation: z.string().optional(),
  })
  .refine(
    (value) =>
      !['confirmed', 'corrected', 'independently_supported'].includes(value.kind) ||
      value.evidenceIds.length > 0,
    'This feedback requires evidence',
  );
export type Observation = z.infer<typeof observationSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type Change = z.infer<typeof changeSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type CallerContext = z.infer<typeof contextSchema>;
export type ScopeGrant = z.infer<typeof scopeGrantSchema>;

export const observeRequestSchema = observationSchema.extend({ requestId: idSchema });
export const observeReceiptSchema = z.object({ evidenceId: idSchema });
export const readEvidenceRequestSchema = z.object({ evidenceId: idSchema });
/** Public source DTO, independent of the reference engine's storage keys. */
export const evidenceSchema = observationSchema.extend({
  evidenceId: idSchema,
  principalId: idSchema,
  recordedAt: timeSchema,
});
export const openSessionRequestSchema = mutationSchema.extend({
  protocolVersion: z.string(),
  taskRef: idSchema,
  expiresAt: timeSchema,
});
export const readDeltasRequestSchema = sessionRequestSchema.extend({ afterVersion: versionSchema });
export const readDeltasResultSchema = z.object({
  batches: z.array(batchSchema),
  throughVersion: versionSchema,
});
export const feedbackReceiptSchema = z.object({
  feedbackId: idSchema,
  status: z.literal('recorded'),
});
export const closeSessionRequestSchema = mutationSchema.extend({
  sessionId: idSchema,
  expectedVersion: versionSchema,
});
export const capabilitiesSchema = z.object({
  protocolVersions: z.array(z.string()),
  protocolCommit: z.string(),
  engineProfile: idSchema,
  supportedScopeKinds: z.array(scopeKindSchema),
  durability: z.enum(['durable', 'volatile']),
  replayRetentionMs: z.number().positive(),
  deltaHistoryMs: z.number().positive(),
  limits: z.object({
    observationBytes: z.number().positive(),
    cueBytes: z.number().positive(),
    activeCandidates: z.number().int().positive(),
    sessionLifetimeMs: z.number().positive(),
    retainedPayloadBytes: z.number().positive(),
  }),
  experimental: z.array(z.string()),
});
export type ScopeKind = z.infer<typeof scopeKindSchema>;
export type ObserveRequest = z.infer<typeof observeRequestSchema>;
export type ObserveReceipt = z.infer<typeof observeReceiptSchema>;
export type ReadEvidenceRequest = z.infer<typeof readEvidenceRequestSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type OpenSessionRequest = z.infer<typeof openSessionRequestSchema>;
export type AdvanceSessionRequest = z.infer<typeof advanceSchema>;
export type ReadSessionRequest = z.infer<typeof sessionRequestSchema>;
export type ReadDeltasRequest = z.infer<typeof readDeltasRequestSchema>;
export type ReadDeltasResult = z.infer<typeof readDeltasResultSchema>;
export type FeedbackRequest = z.infer<typeof feedbackSchema>;
export type FeedbackReceipt = z.infer<typeof feedbackReceiptSchema>;
export type CloseSessionRequest = z.infer<typeof closeSessionRequestSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
