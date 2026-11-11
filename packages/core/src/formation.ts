import { z } from 'zod';
import { validTimeSchema, type Json } from './contracts.js';
import { RecallError, type Environment } from './environment.js';
import { clamp, cueSimilarity, extractCues, retentionFingerprint } from './policy.js';
import { nextId, type Evidence, type MemoryRecord, type StoreState } from './store.js';

const interpretationSchema = z
  .object({
    correctsEvidenceId: z.string().optional(),
    supersedesEvidenceId: z.string().optional(),
    validTime: validTimeSchema.nullable().optional(),
  })
  .passthrough();
export function interpret(content: Json) {
  const result = interpretationSchema.safeParse(content);
  return result.success ? result.data : {};
}
export function formMemory(env: Environment, state: StoreState, source: Evidence): string {
  const details = interpret(source.content),
    cues = extractCues(source.content),
    now = env.clock();
  const previousId = details.correctsEvidenceId ?? details.supersedesEvidenceId;
  const previous = previousId
    ? Object.values(state.memories).find(
        (memory) =>
          memory.scopeKey === env.scopeKey &&
          memory.versions.some((version) => version.evidenceIds.includes(previousId)),
      )
    : undefined;
  if (previousId) env.evidence(state, previousId);
  if (previousId && state.processing[previousId]?.status !== 'completed')
    throw new RecallError(
      'temporarily_unavailable',
      'Referenced experience must be processed first',
      true,
    );
  const previousVersion = previous?.versions.at(-1);
  if (previous && previousVersion && details.correctsEvidenceId) {
    previous.versions.push({
      revision: previousVersion.revision + 1,
      recordedAt: new Date(now).toISOString(),
      content: source.content,
      evidenceIds: [...new Set([...previousVersion.evidenceIds, source.evidenceId])],
      validTime: details.validTime ?? previousVersion.validTime,
      cause: 'correction',
    });
    previous.cues = cues;
    return previous.memoryId;
  }
  if (previous && previousVersion && details.supersedesEvidenceId && details.validTime?.from) {
    previous.versions.push({
      ...previousVersion,
      revision: previousVersion.revision + 1,
      recordedAt: new Date(now).toISOString(),
      evidenceIds: [...previousVersion.evidenceIds, source.evidenceId],
      validTime: { from: previousVersion.validTime?.from ?? null, until: details.validTime.from },
      cause: 'world-change',
    });
  }
  const memoryId = nextId(state, 'memory');
  const others = Object.values(state.memories).filter(
    (memory) =>
      memory.scopeKey === env.scopeKey &&
      memory.versions.every((version) => version.evidenceIds.every((id) => env.canRead(state, id))),
  );
  const redundancy = Math.max(0, ...others.map((memory) => cueSimilarity(memory.cues, cues)));
  state.memories[memoryId] = {
    memoryId,
    scopeKey: env.scopeKey,
    cues,
    versions: [
      {
        revision: 1,
        recordedAt: new Date(now).toISOString(),
        content: source.content,
        evidenceIds: [source.evidenceId],
        validTime: details.validTime ?? null,
        cause: 'formed',
      },
    ],
    retentionPolicy: retentionFingerprint(env.policy),
    accessibility: 0.5,
    evaluatedAt: now,
    dormantSince: null,
    protected: false,
    retentionValue: clamp(1 - redundancy),
  };
  for (const other of others) {
    const weight = cueSimilarity(other.cues, cues);
    if (weight >= 0.2)
      state.associations.push({
        from: other.memoryId,
        to: memoryId,
        scopeKey: env.scopeKey,
        weight,
      });
  }
  return memoryId;
}
export function selectVersion(memory: MemoryRecord, knownAt: string, validAt: string) {
  const version = memory.versions.filter((entry) => entry.recordedAt <= knownAt).at(-1);
  if (
    !version ||
    (version.validTime?.from && version.validTime.from > validAt) ||
    (version.validTime?.until && version.validTime.until <= validAt)
  )
    return undefined;
  return version;
}
