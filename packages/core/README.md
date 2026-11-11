# @skein-js/recall-delta

Framework-neutral deterministic reference engine for Recall Delta draft.4. See the root
[working example](../../README.md#use-the-library-without-a-framework) and [API contract](../../docs/api.md).

Exports include createRecallDelta, createMemoryRecallStore, Zod schemas and inferred types,
applyBatch/diffCandidates, the versioned development policy, and the RecallStore interface.
`RecallDeltaClient` contains nine typed operations and permits synchronous or asynchronous backends.
`createRecallDelta` returns the synchronous `RecallDeltaEngine`. Processing, inspection, accounting,
revocation, and retention each have separate experimental capability interfaces; core clients do not
need to implement them. Request types and schemas are exported, including `ObserveRequest`,
`OpenSessionRequest`, and `AdvanceSessionRequest`.

Reference-engine adapter authors import `StoreState`, `storeStateSchema`, `emptyStoreState`, and
`storageSchemaVersion` from `@skein-js/recall-delta/storage/v2`. This synchronous SPI is specific to
the reference engine, independently versioned from the portable client contract.
All mutating operations are atomic through the configured store. The memory store is volatile.

Trusted applications bind caller identity and scope; the library does not implement authentication.
Every returned candidate has source references; unknown factual credibility remains null. Processing,
inspection, temporal queries, revocation and retention extensions are experimental.

Build with `pnpm exec nx build core`. No package has been published.
