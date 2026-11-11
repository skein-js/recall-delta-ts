import { canonical, type Batch, type Candidate, type Snapshot } from '@skein-js/recall-delta';
import type { HostView, Mode } from './domain.js';

export const historicalContextByteLimit = 2000;
/** Conservative ASCII-fixture budget; report provider token usage separately in live studies. */
export function assembleCandidates(candidates: Candidate[], mode: Mode): Candidate[] {
  if (mode === 'context') return [];
  const ordered = mode === 'summary' ? candidates.slice(0, 4) : candidates;
  const selected: Candidate[] = [];
  for (const candidate of ordered) {
    if (
      new TextEncoder().encode(JSON.stringify([...selected, candidate])).length <=
      historicalContextByteLimit
    )
      selected.push(candidate);
  }
  return selected;
}
export function reconsider(view: HostView, next: Snapshot, batch: Batch): HostView {
  const old = new Map(view.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const invalidated = new Set(
    batch.changes
      .filter((change) => {
        if (change.type === 'candidate.withdrawn') return true;
        if (change.type === 'candidate.emerged') return false;
        const previous = old.get(change.candidateId);
        return (
          !previous ||
          canonical([previous.content, previous.evidenceRefs, previous.validTime]) !==
            canonical([
              change.current.content,
              change.current.evidenceRefs,
              change.current.validTime,
            ])
        );
      })
      .map((change) => change.candidateId),
  );
  return {
    snapshot: next,
    candidates: next.candidates,
    assumptions: view.assumptions.map((assumption) =>
      invalidated.has(assumption.candidateId)
        ? { ...assumption, status: 'stale' as const }
        : assumption,
    ),
  };
}
