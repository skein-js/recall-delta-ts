import { z } from 'zod';

import {
  batchSchema,
  candidateSchema,
  contextSchema,
  idSchema,
  jsonSchema,
  observationSchema,
  scopeKindSchema,
  snapshotSchema,
  timeSchema,
  validTimeSchema,
} from './contracts.js';

export const evidenceSchema = observationSchema.extend({
  evidenceId: z.string(),
  scopeKey: z.string(),
  principalId: z.string(),
  recordedAt: timeSchema,
  revoked: z.boolean(),
});
const memoryVersionSchema = z.object({
  interpretationEvidenceId: idSchema,
  revision: z.number().int().positive(),
  recordedAt: timeSchema,
  content: jsonSchema,
  evidenceIds: z.array(z.string()),
  validTime: validTimeSchema.nullable(),
  cause: z.enum(['formed', 'correction', 'world-change']),
});
const memorySchema = z.object({
  memoryId: z.string(),
  scopeKey: z.string(),
  cues: z.array(z.string()),
  versions: z.array(memoryVersionSchema).min(1),
  retentionPolicy: z.string(),
  accessibility: z.number(),
  evaluatedAt: z.number(),
  dormantSince: z.number().nullable(),
  protected: z.boolean(),
  retentionValue: z.number().nullable(),
});
const sessionSchema = z.object({
  sessionId: z.string(),
  scopeKey: z.string(),
  principalId: z.string(),
  epoch: z.number(),
  expiresAt: z.number(),
  snapshot: snapshotSchema,
  activation: z.record(z.string(), z.number()),
  batches: z.array(batchSchema),
  snapshots: z.record(z.string(), snapshotSchema),
});
const processingSchema = z.object({
  evidenceId: z.string(),
  scopeKey: z.string(),
  status: z.enum(['pending', 'completed', 'failed']),
  error: z.string().nullable(),
});
export const storageSchemaVersion = 2;
const scopeSchema = contextSchema
  .omit({ principalId: true })
  .extend({
    kind: scopeKindSchema,
    ownerId: idSchema.nullable(),
  })
  .refine((scope) => (scope.kind === 'user-private') === (scope.ownerId !== null));
export const storeStateSchema = z.object({
  schemaVersion: z.literal(storageSchemaVersion),
  scopes: z.record(z.string(), scopeSchema),
  sequence: z.number().int().nonnegative(),
  evidence: z.record(z.string(), evidenceSchema),
  memories: z.record(z.string(), memorySchema),
  sessions: z.record(z.string(), sessionSchema),
  processing: z.record(z.string(), processingSchema),
  receipts: z.record(
    z.string(),
    z.object({
      scopeKey: z.string(),
      payload: z.string(),
      result: jsonSchema,
      expiresAt: z.number(),
      epoch: z.number(),
    }),
  ),
  epochs: z.record(z.string(), z.number()),
  associations: z.array(
    z.object({ from: z.string(), to: z.string(), scopeKey: z.string(), weight: z.number() }),
  ),
  overlays: z.record(z.string(), z.number()),
  learning: z.record(z.string(), z.number()),
  feedback: z.array(
    z.object({
      feedbackId: z.string(),
      principalId: z.string(),
      scopeKey: z.string(),
      sessionId: z.string(),
      candidateId: z.string(),
      atVersion: z.number(),
      kind: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  evictions: z.record(z.string(), z.object({ scopeKey: z.string(), evictedAt: z.number() })),
});
export type StoreState = z.infer<typeof storeStateSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type MemoryRecord = StoreState['memories'][string];
export type SessionRecord = StoreState['sessions'][string];
export type Processing = StoreState['processing'][string];
export interface RecallStore {
  readonly durable: boolean;
  /** Commit the entire callback or nothing. Callbacks must be synchronous. */
  transact<T>(operation: (state: StoreState) => T): T;
  read(): StoreState;
}
export function emptyStoreState(): StoreState {
  return {
    schemaVersion: storageSchemaVersion,
    scopes: {},
    sequence: 0,
    evidence: {},
    memories: {},
    sessions: {},
    processing: {},
    receipts: {},
    epochs: {},
    associations: [],
    overlays: {},
    learning: {},
    feedback: [],
    evictions: {},
  };
}
export function createMemoryRecallStore(): RecallStore {
  let current = emptyStoreState();
  return {
    durable: false,
    read: () => structuredClone(current),
    transact(operation) {
      const next = structuredClone(current);
      const result = operation(next);
      const validated = storeStateSchema.parse(next);
      const clonedResult = structuredClone(result);
      current = validated;
      return clonedResult;
    },
  };
}
export function nextId(state: StoreState, kind: string): string {
  state.sequence += 1;
  return `${kind}-${state.sequence}`;
}
export { candidateSchema };
