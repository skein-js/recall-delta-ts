import { z } from 'zod';

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
    (value) => !value.from || !value.until || value.from < value.until,
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
export const scopeGrantSchema = z.object({
  kind: z.enum(['user-private', 'conversation', 'group-shared', 'tenant-shared']),
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
