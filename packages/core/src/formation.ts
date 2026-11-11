import { z } from 'zod';

import { idSchema, type Json, validTimeSchema } from './contracts.js';
import { type Environment, parse, RecallError } from './environment.js';
import { clamp, cueSimilarity, extractCues, retentionFingerprint } from './policy.js';
import { type Evidence, type MemoryRecord, nextId, type StoreState } from './store.js';
import { compareInstants } from './time.js';

const interpretationSchema = z
  .object({
    correctsEvidenceId: idSchema.optional(),
    supersedesEvidenceId: idSchema.optional(),
    validTime: validTimeSchema.nullable().optional(),
  })
  .passthrough()
  .refine(
    (value) => !(value.correctsEvidenceId && value.supersedesEvidenceId),
    'Choose one interpretation target',
  );
export function interpret(content: Json) {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return {};
  return parse(interpretationSchema, content);
}
export function formMemory(env: Environment, state: StoreState, source: Evidence): string {
  const details = interpret(source.content),
    cues = extractCues(source.content),
    now = env.clock();
  const previousId = details.correctsEvidenceId ?? details.supersedesEvidenceId;
  if (previousId) env.evidence(state, previousId);
  if (previousId && state.processing[previousId]?.status !== 'completed')
    throw new RecallError(
      'temporarily_unavailable',
      'Referenced experience must be processed first',
      true,
    );
  const matches = previousId
    ? Object.values(state.memories).filter(
        (memory) =>
          memory.scopeKey === env.scopeKey &&
          memory.versions.some((version) => version.interpretationEvidenceId === previousId),
      )
    : [];
  if (previousId && matches.length !== 1)
    throw new RecallError('evidence_unavailable', 'A unique retained interpretation is required');
  const previous = matches[0];
  previous?.versions.forEach((version) =>
    version.evidenceIds.forEach((id) => env.evidence(state, id)),
  );
  const previousVersion = previous?.versions.at(-1);
  if (previous && previousVersion && details.correctsEvidenceId) {
    previous.versions.push({
      revision: previousVersion.revision + 1,
      recordedAt: new Date(now).toISOString(),
      content: source.content,
      evidenceIds: [...new Set([...previousVersion.evidenceIds, source.evidenceId])],
      validTime: details.validTime ?? previousVersion.validTime,
      interpretationEvidenceId: source.evidenceId,
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
        interpretationEvidenceId: source.evidenceId,
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
  const version = memory.versions
    .filter((entry) => compareInstants(entry.recordedAt, knownAt) <= 0)
    .at(-1);
  if (
    !version ||
    (version.validTime?.from && compareInstants(version.validTime.from, validAt) > 0) ||
    (version.validTime?.until && compareInstants(version.validTime.until, validAt) <= 0)
  )
    return undefined;
  return version;
}
