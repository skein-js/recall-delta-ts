import {
  type Batch,
  batchSchema,
  type Candidate,
  type Change,
  type Snapshot,
  snapshotSchema,
} from './contracts.js';
import { canonical } from './policy.js';

export function diffCandidates(
  previous: readonly Candidate[],
  current: readonly Candidate[],
  reasonCodes: string[],
): Change[] {
  const before = new Map(previous.map((candidate) => [candidate.candidateId, candidate]));
  const after = new Map(current.map((candidate) => [candidate.candidateId, candidate]));
  const changes: Change[] = [];
  for (const candidateId of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(candidateId),
      next = after.get(candidateId);
    if (!next) changes.push({ type: 'candidate.withdrawn', candidateId, reasonCodes });
    else if (!old)
      changes.push({ type: 'candidate.emerged', candidateId, current: next, reasonCodes });
    else if (canonical(old) !== canonical(next))
      changes.push({ type: 'candidate.updated', candidateId, current: next, reasonCodes });
  }
  return changes;
}
export function applyBatch(current: Snapshot, input: Batch): Snapshot {
  const snapshot = snapshotSchema.parse(current),
    batch = batchSchema.parse(input);
  if (batch.sessionId !== snapshot.sessionId || batch.engineProfile !== snapshot.engineProfile)
    throw new Error('resync_required');
  if (batch.toVersion !== batch.fromVersion + 1) throw new Error('resync_required');
  if (batch.toVersion <= snapshot.version) return snapshot;
  if (snapshot.status !== 'open' || batch.fromVersion !== snapshot.version)
    throw new Error('resync_required');
  if (batch.status === 'closed' && batch.changes.length) throw new Error('resync_required');
  const candidates = new Map(
    snapshot.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const seen = new Set<string>();
  for (const change of batch.changes) {
    if (seen.has(change.candidateId)) throw new Error('resync_required');
    seen.add(change.candidateId);
    if ((change.type === 'candidate.emerged') === candidates.has(change.candidateId))
      throw new Error('resync_required');
    if (change.type === 'candidate.withdrawn') candidates.delete(change.candidateId);
    else {
      if (change.current.candidateId !== change.candidateId) throw new Error('resync_required');
      candidates.set(change.candidateId, change.current);
    }
  }
  return {
    ...snapshot,
    status: batch.status,
    version: batch.toVersion,
    candidates: [...candidates.values()],
  };
}
