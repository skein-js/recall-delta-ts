import { z } from 'zod';

import { type Environment, parse, RecallError } from './environment.js';
import {
  maintainRequestSchema,
  maintainResultSchema,
  protectMemoryRequestSchema,
  protectMemoryResultSchema,
  revokeEvidenceRequestSchema,
  revokeEvidenceResultSchema,
} from './extensions.js';
import { retainedBytes, retentionFingerprint } from './policy.js';

export function revokeEvidence(env: Environment, input: unknown) {
  const request = parse(revokeEvidenceRequestSchema, input);
  env.grant('maintain');
  return env.mutate('revokeEvidence', request, revokeEvidenceResultSchema, (state) => {
    const evidence = env.evidence(state, request.evidenceId);
    evidence.revoked = true;
    const authorizationEpoch = (state.epochs[env.scopeKey] ?? 0) + 1;
    state.epochs[env.scopeKey] = authorizationEpoch;
    if (request.erase) {
      evidence.content = null;
      evidence.source = { type: 'erased', id: 'erased' };
      const removed = new Set(
        Object.values(state.memories)
          .filter(
            (memory) =>
              memory.scopeKey === env.scopeKey &&
              memory.versions.some((version) => version.evidenceIds.includes(evidence.evidenceId)),
          )
          .map((memory) => memory.memoryId),
      );
      for (const id of removed) delete state.memories[id];
      state.associations = state.associations.filter(
        (edge) => !removed.has(edge.from) && !removed.has(edge.to),
      );
      for (const [key, session] of Object.entries(state.sessions))
        if (session.scopeKey === env.scopeKey) delete state.sessions[key];
      // The bounded PoC uses one receipt map. Erasure discards old replay payloads conservatively.
      for (const [key, receipt] of Object.entries(state.receipts))
        if (receipt.scopeKey === env.scopeKey) delete state.receipts[key];
      for (const key of Object.keys(state.overlays)) {
        const [scope, , memoryId] = z
          .tuple([z.string(), z.string(), z.string()])
          .parse(JSON.parse(key));
        if (scope === env.scopeKey && removed.has(memoryId)) delete state.overlays[key];
      }
      for (const key of Object.keys(state.learning)) {
        const [scope, , , , memoryId] = z
          .tuple([z.string(), z.string(), z.string(), z.number(), z.string()])
          .parse(JSON.parse(key));
        if (scope === env.scopeKey && removed.has(memoryId)) delete state.learning[key];
      }
    }
    return { status: 'invalidated' as const, authorizationEpoch };
  });
}
export function protectMemory(env: Environment, input: unknown) {
  const request = parse(protectMemoryRequestSchema, input);
  env.grant('maintain');
  return env.mutate('protectMemory', request, protectMemoryResultSchema, (state) => {
    const memory = state.memories[request.memoryId];
    if (
      !memory ||
      memory.scopeKey !== env.scopeKey ||
      !memory.versions.every((version) => version.evidenceIds.every((id) => env.canRead(state, id)))
    )
      throw new RecallError('evidence_unavailable');
    memory.protected = request.protected;
    memory.retentionValue = request.retentionValue;
    return { status: 'recorded' as const };
  });
}
export function maintain(env: Environment, input: unknown) {
  const request = parse(maintainRequestSchema, input);
  env.grant('maintain');
  return env.mutate('maintain', request, maintainResultSchema, (state) => {
    const before = retainedBytes(state),
      evictedIds: string[] = [],
      now = env.clock();
    for (const memory of Object.values(state.memories)) {
      if (
        memory.scopeKey !== env.scopeKey ||
        !memory.versions.every((version) =>
          version.evidenceIds.every((id) => env.canRead(state, id)),
        )
      )
        continue;
      const fingerprint = retentionFingerprint(env.policy);
      if (memory.retentionPolicy !== fingerprint) {
        memory.retentionPolicy = fingerprint;
        memory.dormantSince = null;
        memory.evaluatedAt = now;
      }
      const elapsed = Math.max(0, now - memory.evaluatedAt);
      memory.accessibility *= Math.exp(-elapsed / env.policy.decayMs);
      memory.evaluatedAt = Math.max(now, memory.evaluatedAt);
      if (memory.accessibility >= env.policy.dormantBelow) memory.dormantSince = null;
      else memory.dormantSince ??= now;
      const eligible =
        memory.dormantSince !== null &&
        now - memory.dormantSince >= env.policy.graceMs &&
        memory.retentionValue !== null &&
        memory.retentionValue <= 0.2 &&
        !memory.protected;
      if (!request.capacityPressure || !eligible) continue;
      delete state.memories[memory.memoryId];
      state.associations = state.associations.filter(
        (edge) => edge.from !== memory.memoryId && edge.to !== memory.memoryId,
      );
      state.evictions[memory.memoryId] = { scopeKey: env.scopeKey, evictedAt: now };
      evictedIds.push(memory.memoryId);
    }
    return {
      evictedIds,
      netPayloadBytes: before - retainedBytes(state),
      outcome: !request.capacityPressure
        ? ('decay-only' as const)
        : evictedIds.length
          ? ('reclaimed' as const)
          : ('capacity-exhausted' as const),
    };
  });
}
