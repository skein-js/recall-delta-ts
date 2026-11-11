import { z } from 'zod';

import type { Awaitable } from './client.js';
import type { readEvidenceRequestSchema } from './contracts.js';
import {
  evidenceSchema,
  feedbackSchema,
  idSchema,
  jsonSchema,
  mutationSchema,
  timeSchema,
  validTimeSchema,
  versionSchema,
} from './contracts.js';

export const processEvidenceRequestSchema = mutationSchema.extend({
  evidenceId: idSchema,
  fail: z.boolean().optional(),
});
export const processingResultSchema = z.object({
  evidenceId: idSchema,
  status: z.enum(['pending', 'completed', 'failed']),
  error: z.string().nullable(),
});
export const processEvidenceResultSchema = processingResultSchema.extend({
  status: z.enum(['completed', 'failed']),
});
export const revokeEvidenceRequestSchema = mutationSchema.extend({
  evidenceId: idSchema,
  erase: z.boolean().optional(),
});
export const revokeEvidenceResultSchema = z.object({
  status: z.literal('invalidated'),
  authorizationEpoch: versionSchema,
});
export const protectMemoryRequestSchema = mutationSchema.extend({
  memoryId: idSchema,
  protected: z.boolean(),
  retentionValue: z.number().min(0).max(1).nullable(),
});
export const protectMemoryResultSchema = z.object({ status: z.literal('recorded') });
export const maintainRequestSchema = mutationSchema.extend({ capacityPressure: z.boolean() });
export const maintainResultSchema = z.object({
  evictedIds: z.array(idSchema),
  netPayloadBytes: z.number(),
  outcome: z.enum(['decay-only', 'reclaimed', 'capacity-exhausted']),
});
export const accountingResultSchema = z.object({
  retainedPayloadBytes: z.number().nonnegative(),
  hardLimitBytes: z.number().positive(),
  boundary: z.string(),
});
/** Experimental inspection DTOs are not a portable backend storage format. */
export const inspectionResultSchema = z.object({
  evidence: z.array(evidenceSchema),
  memories: z.array(
    z.object({
      memoryId: idSchema,
      cues: z.array(z.string()),
      protected: z.boolean(),
      accessibility: z.number(),
      retentionValue: z.number().nullable(),
      versions: z.array(
        z.object({
          revision: versionSchema,
          recordedAt: timeSchema,
          content: jsonSchema,
          interpretationEvidenceId: idSchema,
          evidenceIds: z.array(idSchema),
          validTime: validTimeSchema.nullable(),
          cause: z.enum(['formed', 'correction', 'world-change']),
        }),
      ),
    }),
  ),
  processing: z.array(processingResultSchema),
  feedback: z.array(
    z.object({
      feedbackId: idSchema,
      principalId: idSchema,
      sessionId: idSchema,
      candidateId: idSchema,
      atVersion: versionSchema,
      kind: feedbackSchema.shape.kind,
      evidenceIds: z.array(idSchema),
    }),
  ),
});
export type ProcessEvidenceRequest = z.infer<typeof processEvidenceRequestSchema>;
export type ProcessEvidenceResult = z.infer<typeof processEvidenceResultSchema>;
export type ProcessingResult = z.infer<typeof processingResultSchema>;
export type RevokeEvidenceRequest = z.infer<typeof revokeEvidenceRequestSchema>;
export type RevokeEvidenceResult = z.infer<typeof revokeEvidenceResultSchema>;
export type ProtectMemoryRequest = z.infer<typeof protectMemoryRequestSchema>;
export type ProtectMemoryResult = z.infer<typeof protectMemoryResultSchema>;
export type MaintainRequest = z.infer<typeof maintainRequestSchema>;
export type MaintainResult = z.infer<typeof maintainResultSchema>;
export type AccountingResult = z.infer<typeof accountingResultSchema>;
export type InspectionResult = z.infer<typeof inspectionResultSchema>;
export interface ProcessingCapability {
  processEvidence(request: ProcessEvidenceRequest): Awaitable<ProcessEvidenceResult>;
  readProcessing(request: z.infer<typeof readEvidenceRequestSchema>): Awaitable<ProcessingResult>;
}
export interface InspectionCapability {
  inspect(): Awaitable<InspectionResult>;
}
export interface AccountingCapability {
  accounting(): Awaitable<AccountingResult>;
}
export interface RevocationCapability {
  revokeEvidence(request: RevokeEvidenceRequest): Awaitable<RevokeEvidenceResult>;
}
export interface RetentionCapability {
  protectMemory(request: ProtectMemoryRequest): Awaitable<ProtectMemoryResult>;
  maintain(request: MaintainRequest): Awaitable<MaintainResult>;
}
