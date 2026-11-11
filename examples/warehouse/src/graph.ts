import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  applyBatch,
  type ProcessingCapability,
  protocolVersion,
  type RecallDeltaClient,
  RecallError,
  type Snapshot,
} from '@skein-js/recall-delta';

import { assembleCandidates, reconsider } from './context.js';
import {
  type HostView,
  inputSchema,
  type Mode,
  type Plan,
  planSchema,
  type TraceEvent,
  verifyAction,
  type WarehouseInput,
} from './domain.js';
import { fixturePlanner, type Planner } from './planner.js';

const State = Annotation.Root({
  runId: Annotation<string>,
  cues: Annotation<string[]>,
  observations: Annotation<WarehouseInput['observations']>,
  system: Annotation<WarehouseInput['system']>,
  view: Annotation<HostView>({
    reducer: (_, next) => next,
    default: () => ({ snapshot: null, candidates: [], assumptions: [] }),
  }),
  admitted: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  plan: Annotation<Plan | null>({ reducer: (_, next) => next, default: () => null }),
  deadline: Annotation<string>({ reducer: (_, next) => next, default: () => '' }),
  actionCommitted: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),
  toolCalls: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  diagnostic: Annotation<WarehouseInput['system'] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (prior, next) => [...prior, ...next],
    default: () => [],
  }),
});
type StateValue = typeof State.State;
export type WarehouseMemory = RecallDeltaClient & { experimental: ProcessingCapability };
export interface WarehouseOptions {
  memory: () => WarehouseMemory;
  mode: Mode;
  planner?: Planner;
  clock?: () => number;
}
export function makeWarehouseGraph(options: WarehouseOptions) {
  const clock = options.clock ?? Date.now;
  async function admit(state: StateValue): Promise<Partial<StateValue>> {
    const input = inputSchema.parse(state);
    const memory = options.memory();
    const admitted = await Promise.all(
      input.observations.map(
        async (observation) =>
          (
            await memory.observe({
              ...observation,
              requestId: `${input.runId}:observe:${observation.observationId}`,
            })
          ).evidenceId,
      ),
    );
    return {
      admitted,
      deadline: new Date(clock() + 3_600_000).toISOString(),
      toolCalls: 0,
      diagnostic: null,
      trace: [
        {
          phase: 'admit',
          detail: `${admitted.length} evidence receipts; admission alone does not promise completed processing`,
        },
      ],
    };
  }
  async function ready(state: StateValue): Promise<Partial<StateValue>> {
    const memory = options.memory();
    for (const evidenceId of state.admitted) {
      const result = await memory.experimental.processEvidence({
        evidenceId,
        requestId: `${state.runId}:process:${evidenceId}`,
      });
      if (result.status !== 'completed')
        throw new Error('Memory processing failed; recall must not pretend it completed');
    }
    return { trace: [{ phase: 'ready', detail: 'All newly admitted observations evaluated' }] };
  }
  async function advance(state: StateValue): Promise<Partial<StateValue>> {
    const memory = options.memory();
    let view = state.view;
    if (view.snapshot) {
      try {
        await memory.readSession({ sessionId: view.snapshot.sessionId });
      } catch (error) {
        if (
          !(error instanceof RecallError) ||
          !['session_unavailable', 'session_expired', 'session_closed'].includes(error.code)
        )
          throw error;
        view = {
          snapshot: null,
          candidates: [],
          assumptions: view.assumptions.map((entry) => ({ ...entry, status: 'stale' })),
        };
      }
    }
    let snapshot: Snapshot =
      view.snapshot ??
      (await memory.openSession({
        requestId: `${state.runId}:open`,
        protocolVersion,
        taskRef: 'warehouse-investigation',
        expiresAt: state.deadline,
      }));
    // Payload is derived from checkpointed input, so a restarted node repeats the same logical request.
    let reconcile = false;
    const request = () => ({
      requestId: reconcile
        ? `${state.runId}:reconcile:${snapshot.version}`
        : `${state.runId}:advance`,
      sessionId: snapshot.sessionId,
      expectedVersion: snapshot.version,
      cues: state.cues,
      evidenceIds: [],
    });
    let batch;
    try {
      batch = await memory.advanceSession(request());
    } catch (error) {
      if (!(error instanceof RecallError) || error.code !== 'version_conflict') throw error;
      snapshot = await memory.readSession({ sessionId: snapshot.sessionId });
      reconcile = true;
      batch = await memory.advanceSession(request());
    }
    const next = applyBatch(snapshot, batch);
    return {
      view: reconsider(view, next, batch),
      plan: null,
      trace: [
        {
          phase: 'recall',
          detail: `${batch.changes.length} changes at session version ${batch.toVersion}; affected assumptions invalidated`,
        },
      ],
    };
  }
  async function investigate(state: StateValue): Promise<Partial<StateValue>> {
    const candidates = assembleCandidates(state.view.candidates, options.mode);
    const plan = planSchema.parse(
      await (options.planner ?? fixturePlanner)({
        cues: state.cues,
        candidates,
        currentEvidence: state.diagnostic,
      }),
    );
    if (!plan.basedOn.every((id) => candidates.some((candidate) => candidate.candidateId === id)))
      throw new Error('Planner cited unavailable evidence');
    const assumptions = plan.basedOn.map((candidateId) => ({
      candidateId,
      atVersion: state.view.snapshot?.version ?? 0,
      status: 'active' as const,
    }));
    return {
      plan,
      view: {
        ...state.view,
        assumptions: [
          ...state.view.assumptions.filter((entry) => entry.status === 'stale'),
          ...assumptions,
        ],
      },
      trace: [
        {
          phase: 'investigate',
          detail: `${options.planner ? 'Configured planner' : 'Offline fixture'} proposed ${plan.action}`,
        },
      ],
    };
  }
  async function verify(state: StateValue): Promise<Partial<StateValue>> {
    const memory = options.memory();
    if (state.view.snapshot) await memory.readSession({ sessionId: state.view.snapshot.sessionId });
    for (const candidate of state.view.candidates.filter((entry) =>
      state.plan?.basedOn.includes(entry.candidateId),
    )) {
      for (const ref of candidate.evidenceRefs)
        await memory.readEvidence({ evidenceId: ref.evidenceId });
    }
    const valid = state.plan !== null && verifyAction(state.plan, state.system);
    if (state.toolCalls >= 8) throw new Error('Diagnostic tool budget exhausted');
    return {
      actionCommitted: valid && state.plan?.action !== 'inspect-posting-job',
      toolCalls: state.toolCalls + 1,
      diagnostic: state.plan?.action === 'inspect-posting-job' ? state.system : state.diagnostic,
      trace: [
        {
          phase: 'verify',
          detail: valid
            ? 'Authoritative simulated preconditions satisfied'
            : 'Proposed action blocked by current simulated system state',
        },
      ],
    };
  }
  return new StateGraph(State)
    .addNode('admit', admit)
    .addNode('ready', ready)
    .addNode('advance', advance)
    .addNode('investigate', investigate)
    .addNode('verify', verify)
    .addEdge(START, 'admit')
    .addEdge('admit', 'ready')
    .addEdge('ready', 'advance')
    .addEdge('advance', 'investigate')
    .addEdge('investigate', 'verify')
    .addConditionalEdges('verify', (state) =>
      state.plan?.action === 'inspect-posting-job' && state.toolCalls < 8 ? 'investigate' : END,
    )
    .compile();
}
