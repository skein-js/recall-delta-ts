import { feedbackReceiptSchema, feedbackSchema } from './contracts.js';
import { type Environment, parse, RecallError } from './environment.js';
import { canonical } from './policy.js';
import { nextId } from './store.js';

export function recordFeedback(env: Environment, input: unknown) {
  const request = parse(feedbackSchema, input);
  return env.mutate('recordFeedback', request, feedbackReceiptSchema, (state) => {
    const session = env.session(state, request.sessionId);
    const candidate = session.snapshots[String(request.atVersion)]?.candidates.find(
      (entry) => entry.candidateId === request.candidateId,
    );
    if (!candidate) throw new RecallError('feedback_target_unavailable');
    candidate.evidenceRefs.forEach((ref) => env.evidence(state, ref.evidenceId));
    request.evidenceIds.forEach((id) => env.evidence(state, id));
    const feedbackId = nextId(state, 'feedback');
    state.feedback.push({
      feedbackId,
      principalId: env.context.principalId,
      scopeKey: env.scopeKey,
      sessionId: request.sessionId,
      candidateId: request.candidateId,
      atVersion: request.atVersion,
      kind: request.kind,
      evidenceIds: request.evidenceIds,
    });
    for (const memoryId of candidate.memoryRefs) {
      const key = canonical([env.scopeKey, env.context.principalId, memoryId]);
      const delta = request.kind === 'rejected' ? -0.2 : request.kind === 'useful' ? 0.05 : 0;
      state.overlays[key] = Math.min(1, Math.max(-1, (state.overlays[key] ?? 0) + delta));
    }
    return { feedbackId, status: 'recorded' as const };
  });
}
