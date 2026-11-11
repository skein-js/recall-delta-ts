# @skein-js/recall-delta

Framework-neutral deterministic reference engine for Recall Delta draft.4. See the root
[working example](../../README.md#use-the-library-without-a-framework) and [API contract](../../docs/api.md).

Exports include createRecallDelta, createMemoryRecallStore, Zod schemas and inferred types,
applyBatch/diffCandidates, the versioned development policy, and the RecallStore interface.
All mutating operations are atomic through the configured store. The memory store is volatile.

Trusted applications bind caller identity and scope; the library does not implement authentication.
Every returned candidate has source references; unknown factual credibility remains null. Processing,
inspection, temporal queries, revocation and retention extensions are experimental.

Build with `pnpm exec nx build core`. No package has been published.
