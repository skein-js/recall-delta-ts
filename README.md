# Recall Delta TypeScript

A framework-neutral reference memory engine, transactional SQLite adapter, and a LangGraph/Skein
warehouse investigation PoC. This is experimental infrastructure, not a production memory service.

Implements an in-process subset and experimental extensions of [Recall Delta draft.4](https://github.com/skein-js/recall-delta/blob/88f346269e1adaac50ccaebbdfc0a1257b3f8097/spec/recall-delta-protocol.md).
No SDK packages have been published. Use the workspace packages locally.

## Run the PoC

Use Node **24.15.0** (for example `nvm use`) and pnpm **12.18.0**:

```sh
corepack enable
corepack prepare pnpm@12.18.0 --activate
pnpm install --frozen-lockfile
pnpm demo
pnpm experiment
pnpm verify
```

`demo` runs the graph through Skein with separate local SQLite files for workflow state and memory.
It recalls a dispatch incident, changes warehouse context, blocks an inappropriate action, and
revises the same candidate after a source correction. It prints the storage directory and writes
`examples/warehouse/reports/demo.json`. The explicit fixture planner needs no credentials.

`experiment` compares four configurations plus three mechanism ablations on development cases.
It writes `examples/warehouse/reports/development.json`, including all eight question verdicts,
measurements, lineage/revocation checks, longitudinal retrieval streams, and retention accounting.
Fixtures establish mechanics. They do not establish live-agent quality or general security.

Inspect a demo's memory store:

```sh
pnpm inspect --args="/absolute/path/from/demo/recall.sqlite"
```

The inspector is a trusted local operator tool. See the example README for different scope bindings.

## Explore the Skein example

```sh
pnpm dev
```

Open the loopback address printed by Skein and select the `warehouse` graph in its console. Example
input and the expected journey are in [the warehouse guide](examples/warehouse/README.md).
The CLI's native artifact builder is used for `pnpm build`; no Docker service is required.

## Optional Vertex agent

The memory engine remains deterministic. Only the investigating agent uses a model.
Configure Google Application Default Credentials, then set `GOOGLE_CLOUD_PROJECT`,
`GOOGLE_CLOUD_LOCATION`, and `VERTEX_MODEL` to an authorized configuration:

```sh
pnpm demo:vertex
```

This explicitly selected command can make paid requests, with a maximum of ten model invocations.
Missing configuration or credentials fails; there is no provider fallback. CI and `verify` do not
select Vertex. No live provider or paid evaluation was required to bootstrap this project.

## Use the library without a framework

```ts
import {
  createMemoryRecallStore,
  createRecallDelta,
  protocolVersion,
} from '@skein-js/recall-delta';

const memory = createRecallDelta({
  store: createMemoryRecallStore(),
  context: { tenantId: 'local', scopeId: 'private', principalId: 'alice' },
});

await memory.observe({
  requestId: 'ingest-1',
  observationId: 'incident-1',
  kind: 'event',
  content: 'Warehouse north dispatch was missing its posting job.',
  observedAt: '2026-11-11T10:00:00Z',
  source: { type: 'incident-report', id: 'incident-1' },
});
const session = await memory.openSession({
  requestId: 'open-1',
  protocolVersion,
  taskRef: 'investigation',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const batch = await memory.advanceSession({
  requestId: 'advance-1',
  sessionId: session.sessionId,
  expectedVersion: 0,
  cues: ['north dispatch posting job'],
  evidenceIds: [],
});
console.log(batch.changes);
```

Core contains no LangGraph, Skein, SQLite, or model imports. SQLite is an optional Node-only package:
`createSqliteRecallStore(absoluteFilename)` from `@skein-js/recall-delta-sqlite`; close owned stores
when finished. Its whole-state transaction design is deliberately small and not intended for scale.

## Contracts and limitations

- [API and protocol compatibility](docs/api.md)
- [Experiments, criteria and interpretation](docs/experiments.md)
- [Hindsight compatibility audit](docs/hindsight-audit.md)
- [Engineering guidance and contribution gates](docs/engineering/README.md)

The engine automatically forms episodic records, associations, and temporal revisions. It does not
implement model-assisted semantic consolidation or reproduce human cognition. All credibility and
uncertainty estimates remain unknown rather than invented probabilities.

Logical retained-payload capacity includes every record in the memory store. It is not a physical
disk limit; SQLite/WAL/SHM allocation is reported separately. Raw Skein checkpoints are another
host-owned retention boundary. See the experiment report's revocation limitation.

Apache-2.0 for this implementation. The separately linked protocol/docs retain their original
CC BY 4.0 license; code/examples in that repository are Apache-2.0. Recall Delta contributors are
credited for the originating protocol and conceptual contracts.
