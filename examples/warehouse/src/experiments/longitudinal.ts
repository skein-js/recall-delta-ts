import {
  createMemoryRecallStore,
  createRecallDelta,
  protocolVersion,
} from '@skein-js/recall-delta';
import { report } from '../scenario.js';

/** Episode identities are evaluator expectations, never supplied as ranking labels. */
export function runLongitudinal() {
  const outcomes: {
    stream: number;
    reinforced: boolean;
    rareHits: number;
    rareSurfacedHits: number;
    rareQueries: number;
    rareRetained: boolean;
  }[] = [];
  for (let stream = 0; stream < 20; stream++)
    for (const reinforced of [false, true]) {
      const memory = createRecallDelta({
        store: createMemoryRecallStore(),
        context: { tenantId: `stream-${stream}`, scopeId: 'private', principalId: 'alice' },
        policy: { reinforce: reinforced },
      });
      const hot = memory.observe({
        ...report('hot', 'north', 'delayed-posting', 'wait-for-job'),
        requestId: 'hot',
      });
      const rare = memory.observe({
        ...report('rare', 'south', 'missing-posting', 'post-dispatch'),
        requestId: 'rare',
      });
      const session = memory.openSession({
        requestId: 'open',
        protocolVersion,
        taskRef: 'stream',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      let version = 0,
        rareHits = 0,
        rareSurfacedHits = 0;
      for (let task = 0; task < 25; task++) {
        const target = task < 20 ? hot : rare;
        const cues = task < 20 ? ['north delayed posting job'] : ['south missing dispatch posting'];
        memory.advanceSession({
          requestId: `task-${task}`,
          sessionId: session.sessionId,
          expectedVersion: version++,
          cues,
          evidenceIds: [],
        });
        const candidates = memory.readSession(session).candidates;
        const first = candidates[0];
        if (
          task >= 20 &&
          candidates.some((candidate) =>
            candidate.evidenceRefs.some((ref) => ref.evidenceId === target.evidenceId),
          )
        )
          rareSurfacedHits++;
        if (task >= 20 && first?.evidenceRefs.some((ref) => ref.evidenceId === target.evidenceId))
          rareHits++;
      }
      outcomes.push({
        stream,
        reinforced,
        rareHits,
        rareSurfacedHits,
        rareQueries: 5,
        rareRetained: memory.experimental
          .inspect()
          .memories.some((record) =>
            record.versions.some((version) => version.evidenceIds.includes(rare.evidenceId)),
          ),
      });
    }
  const rate = (reinforced: boolean, metric: 'rareHits' | 'rareSurfacedHits' = 'rareHits') => {
    const selected = outcomes.filter((row) => row.reinforced === reinforced);
    return (
      selected.reduce((sum, row) => sum + row[metric], 0) /
      selected.reduce((sum, row) => sum + row.rareQueries, 0)
    );
  };
  return {
    outcomes,
    rareTop1HitRateWithReinforcement: rate(true),
    rareRecallAtCandidateLimitWithReinforcement: rate(true, 'rareSurfacedHits'),
    rareTop1HitRateWithoutReinforcement: rate(false),
    rareRecallAtCandidateLimitWithoutReinforcement: rate(false, 'rareSurfacedHits'),
    interpretation:
      'Retrieval diagnostic over twenty isolated repetitions of one controlled stream; not agent-task effectiveness or a calibrated confidence estimate',
  };
}
