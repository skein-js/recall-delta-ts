# API and draft compatibility

Protocol source: **0.1-draft.4**, commit `88f346269e1adaac50ccaebbdfc0a1257b3f8097` in
[skein-js/recall-delta](https://github.com/skein-js/recall-delta).
The protocol repository is unchanged. No cross-repository source import is required.

`createRecallDelta({store, context, grant?, canReadEvidence?, clock?, policy?, processingMode?})`
creates an in-process engine. Its concrete operations are synchronous; the exported client contract
allows promises, and the warehouse host awaits operations to support a future remote implementation.
`RecallDeltaClient` explicitly defines only the nine operations below. Each operation has exported
Zod request/result schemas and named inferred types, such as `ObserveRequest`, `OpenSessionRequest`,
`AdvanceSessionRequest`, `FeedbackRequest`, `Capabilities`, and `Evidence`. Public methods accept
these types; runtime validation still rejects malformed JavaScript or transport input.
`readEvidence` returns a source DTO rather than internal storage keys or revocation flags.
Factories validate the caller context. This context is supplied by trusted application code and
does not authenticate a remote caller by itself.

| Operation      | Behavior                                                                    |
| -------------- | --------------------------------------------------------------------------- |
| describe       | Version/profile, scope kinds, limits and storage durability                 |
| observe        | Immutable source admission, observation deduplication and processing status |
| readEvidence   | Authorized original report or typed unavailability error                    |
| openSession    | Caller-owned empty version-zero snapshot                                    |
| advanceSession | CAS, full candidate difference, snapshot/history/receipt atomic commit      |
| readSession    | Current authorized snapshot, with clock-derived expiration                  |
| readDeltas     | Bounded contiguous history pages through a stated version                   |
| recordFeedback | Attributed historical target; private learning overlay, no truth promotion  |
| closeSession   | Empty closing batch and historical final candidate set                      |

Mutations require stable requestId values; observationId additionally deduplicates admitted evidence.
Logical JSON object ordering is ignored. A key with different payload fails with id_conflict.
Retries are protected only for the advertised receipt lifetime. Receipt replay rechecks authorization.
A protected `openSession` retry returns its original committed snapshot even after the session expires;
use `readSession` to obtain its current status. Creation-time deadline checks apply to new requests.
Source content is never fetched through its URI and never establishes permission to act.

Default storage capacity is 16 MiB of canonical UTF-8 retained application payload; default retry and
session limits are one hour. The PoC retains more history than the advertised minimum; there is no
production TTL cleanup scheduler. Capacity exhaustion rejects a transaction without losing an
acknowledged record. Protecting retention records never authorizes silent deletion of evidence.

## Deterministic policy

Every admitted experience forms an episodic record after successful processing. Cues are normalized
from content values. Shared cues establish weighted, one-hop associations. Direct cue fit, carried
activation, bounded association support and competition determine a rounded public activation.
Reinforcement changes accessibility/private pathways and never supplies independent factual support.

The versioned development policy declares carry/spread/inhibition, candidate limits, threshold,
decay, grace and capacity. The retrieval baseline disables carried activation and reinforcement;
the recent-history baseline selects the latest four memories without query ranking. No artificial
noise is added. These policies are research defaults, not recommended universal memory parameters.
`engineProfile` is an opaque, bounded reference-v2 identifier containing the SHA-256 digest of the
canonical validated policy. Equal configurations produce the same identifier; changing the policy
requires a new session. The identifier does not expose the configuration or certify deterministic replay.

## Experimental extensions

These are not standardized transport bindings or interoperable optional profiles.
`ProcessingCapability`, `InspectionCapability`, `AccountingCapability`, `RevocationCapability`, and
`RetentionCapability` are separate interfaces. `RecallDeltaEngine` exposes their synchronous methods
under `experimental`; independent core clients do not need to implement them. The warehouse explicitly
requires `RecallDeltaClient & { experimental: ProcessingCapability }` because its readiness step uses
processing. Discovery and an explicit capability binding must establish support before calling extensions:

```ts
import type { RecallDeltaClient, ProcessingCapability } from '@skein-js/recall-delta';
type ReadyMemory = RecallDeltaClient & { experimental: ProcessingCapability };
```

Experimental behavior:

- **Processing:** deferred admission, explicit processEvidence and pending/completed/failed status.
  Failure injection is available only through this experimental API. There is no autonomous worker
  in the library; the example coordinates processing. A completed receipt means evaluated, not
  necessarily recalled. Referenced corrections wait for original processing.
- **Temporal interpretation:** JSON content may carry correctsEvidenceId, supersedesEvidenceId and
  validTime. The reference policy preserves revisions and source restrictions. An optional temporal
  query selects knownAt before validAt; unknown dates remain unknown. Timestamp comparisons preserve
  fractional-second precision, including equivalent representations with trailing zeros.
  Each revision records its `interpretationEvidenceId` separately from its supporting/contextual
  `evidenceIds`. Corrections target that interpretation relationship, so successor evidence used to
  close a predecessor cannot accidentally select the predecessor. An unavailable or ambiguous target
  returns `evidence_unavailable` atomically. Malformed or conflicting interpretation metadata is rejected.
- **Inspection:** authorized source records, memory versions, processing and caller-private feedback.
  Global accounting requires allowGlobalAccounting, an explicit trusted operator capability.
- **Revocation:** revokeEvidence invalidates all sessions in the affected scope. Old sessions and
  receipts are refused; the host reconstructs fresh context. erase additionally removes retained
  affected domain derivatives/history; it cannot erase copies in Skein checkpoints or provider logs.
- **Retention:** maintain evaluates decay and grace, protection/value checks, then explicit capacity
  eviction. protectMemory is an operator override. Unchanged completed observations are not
  automatically re-encoded after eviction. Evidence retention remains separate.

grant is re-evaluated for each operation, with distinct readers, writers, feedbackWriters and
maintainers. The default private grant applies only when no grant callback was configured; a configured
callback returning null or undefined fails closed. The first committed mutation stores the namespace's
tenant, scope ID, kind, and private owner. Later bindings must match that identity: changing grants
cannot turn private evidence into shared evidence or change its owner. Use a distinct private scope
ID for each effective owner and a separate explicitly authorized namespace for shared memory.
No sharing/promotion operation is provided. Shared membership can change within the same shared kind.
`canReadEvidence` can apply narrower current source policy; source intersections constrain derived recall. These
functions are trusted host code, not fields accepted from model output.

## Reference-engine storage SPI

The portable client contract contains no persisted engine state. Custom reference-engine adapters
use `@skein-js/recall-delta/storage/v2` for `RecallStore`, `StoreState`, `storeStateSchema`,
`emptyStoreState`, and `storageSchemaVersion`. This explicitly versioned synchronous whole-state SPI
is specific to this engine; it is not a portable backend format. The root factory and memory store
remain convenient for local use. Remote backends implement the asynchronous-capable client contract.

Storage schema 2 persists immutable scope identity and primary interpretation relationships. Schema 1
cannot be automatically upgraded safely because its original private/shared audience was not stored.
The SQLite adapter rejects it explicitly without rewriting its payload. Keep the original database
and use a new filename for a fresh PoC; any future migration must supply verified ownership/audience
and interpretation mappings. Never relabel the old schema or infer sharing from a later grant.
Skein checkpoint files have separate ownership and do not use this storage SPI.

## Verification boundary

Behavioral suites cover representative delivery, privacy, time, lifecycle and storage failures.
There is no claim that every C01–C42 scenario from the protocol has been independently certified.
The implementation's experimental defaults and synchronous callback/storage contracts are not a
released network specification or production security assurance.

The standalone applyBatch helper cannot detect conflicting older batches without retained history
hashes. Hosts that need that detection must retain receipts/hashes or resynchronize from the service.
