import type { Candidate, Json } from './contracts.js';
import type { Environment } from './environment.js';
import { selectVersion } from './formation.js';
import { canonical, clamp, cueSimilarity, extractCues, retentionFingerprint } from './policy.js';
import type { SessionRecord, StoreState } from './store.js';

export function recall(
  env: Environment,
  state: StoreState,
  session: SessionRecord,
  cues: Json[],
  temporal?: { validAt: string; knownAt: string },
): Candidate[] {
  const at = new Date(env.clock()).toISOString(),
    words = extractCues(cues);
  const memories = Object.values(state.memories)
    .filter((memory) => memory.scopeKey === env.scopeKey)
    .flatMap((memory) => {
      const version = selectVersion(memory, temporal?.knownAt ?? at, temporal?.validAt ?? at);
      return version && version.evidenceIds.every((id) => env.canRead(state, id))
        ? [{ memory, version }]
        : [];
    });
  const direct = new Map(
    memories.map(({ memory, version }) => [
      memory.memoryId,
      cueSimilarity(words, extractCues(version.content)),
    ]),
  );
  const scored = memories
    .map(({ memory, version }, index) => {
      const relevance = direct.get(memory.memoryId) ?? 0;
      const overlayKey = canonical([env.scopeKey, env.context.principalId, memory.memoryId]);
      let activation = relevance;
      if (env.policy.recallMode === 'recent') activation = (index + 1) / (memories.length + 1);
      if (env.policy.recallMode === 'associative') {
        const support = state.associations
          .filter(
            (edge) =>
              edge.scopeKey === env.scopeKey &&
              (edge.from === memory.memoryId || edge.to === memory.memoryId),
          )
          .reduce(
            (sum, edge) =>
              sum +
              edge.weight * (direct.get(edge.from === memory.memoryId ? edge.to : edge.from) ?? 0),
            0,
          );
        const competitor = Math.max(
          0,
          ...[...direct.entries()]
            .filter(([id]) => id !== memory.memoryId)
            .map(([, score]) => score),
        );
        activation +=
          env.policy.carry * (session.activation[memory.memoryId] ?? 0) +
          env.policy.spread * Math.min(1, support) -
          env.policy.inhibition * competitor +
          (state.overlays[overlayKey] ?? 0);
      }
      return { memory, version, relevance, activation: clamp(activation) };
    })
    .filter((entry) => entry.activation >= env.policy.threshold)
    .sort(
      (left, right) =>
        right.activation - left.activation ||
        left.memory.memoryId.localeCompare(right.memory.memoryId),
    )
    .slice(0, env.policy.candidateLimit);
  session.activation = Object.fromEntries(
    scored.map((entry) => [entry.memory.memoryId, entry.activation]),
  );
  for (const entry of scored) {
    if (!env.policy.reinforce) continue;
    const key = canonical([
      env.scopeKey,
      env.context.principalId,
      session.sessionId,
      session.snapshot.version + 1,
      entry.memory.memoryId,
    ]);
    if (state.learning[key]) continue;
    state.learning[key] = env.clock();
    const overlay = canonical([env.scopeKey, env.context.principalId, entry.memory.memoryId]);
    state.overlays[overlay] = clamp((state.overlays[overlay] ?? 0) + 0.01);
    // Shared base retention is intentionally unaffected by private retrieval activity.
    if (env.grant('read').kind === 'user-private') {
      if (entry.memory.retentionPolicy !== retentionFingerprint(env.policy)) {
        entry.memory.retentionPolicy = retentionFingerprint(env.policy);
        entry.memory.evaluatedAt = env.clock();
      }
      entry.memory.accessibility = clamp(
        entry.memory.accessibility *
          Math.exp(-Math.max(0, env.clock() - entry.memory.evaluatedAt) / env.policy.decayMs) +
          0.05,
      );
      entry.memory.evaluatedAt = env.clock();
      entry.memory.dormantSince = null;
    }
  }
  return scored.map(({ memory, version, relevance, activation }) => ({
    candidateId: `candidate:${memory.memoryId}`,
    memoryRefs: [memory.memoryId],
    content: version.content,
    activation,
    relevance: clamp(relevance),
    validTime: version.validTime,
    factualConfidence: null,
    uncertainty: { ambiguity: null, contradiction: null, sourceDoubt: null, missingContext: null },
    evidenceRefs: version.evidenceIds.map((evidenceId) => ({
      evidenceId,
      role: 'context' as const,
    })),
    verification: 'required',
  }));
}
