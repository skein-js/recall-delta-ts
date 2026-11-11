# API and draft compatibility

Protocol source: **0.1-draft.4**, commit `88f346269e1adaac50ccaebbdfc0a1257b3f8097` in
[skein-js/recall-delta](https://github.com/skein-js/recall-delta).
The protocol repository is unchanged. No cross-repository source import is required.

`createRecallDelta({store, context, grant?, canReadEvidence?, clock?, policy?, processingMode?})`
creates an in-process engine. Its concrete operations are synchronous; the exported client contract
allows promises, and the warehouse host awaits operations to support a future remote implementation.
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

## Experimental extensions

These are not standardized transport bindings or interoperable optional profiles:

- **Processing:** deferred admission, explicit processEvidence and pending/completed/failed status.
  Failure injection is available only through this experimental API. There is no autonomous worker
  in the library; the example coordinates processing. A completed receipt means evaluated, not
  necessarily recalled. Referenced corrections wait for original processing.
- **Temporal interpretation:** JSON content may carry correctsEvidenceId, supersedesEvidenceId and
  validTime. The reference policy preserves revisions and source restrictions. An optional temporal
  query selects knownAt before validAt; unknown dates remain unknown.
- **Inspection:** authorized source records, memory versions, processing and caller-private feedback.
  Global accounting requires allowGlobalAccounting, an explicit trusted operator capability.
- **Revocation:** revokeEvidence invalidates all sessions in the affected scope. Old sessions and
  receipts are refused; the host reconstructs fresh context. erase additionally removes retained
  affected domain derivatives/history; it cannot erase copies in Skein checkpoints or provider logs.
- **Retention:** maintain evaluates decay and grace, protection/value checks, then explicit capacity
  eviction. protectMemory is an operator override. Unchanged completed observations are not
  automatically re-encoded after eviction. Evidence retention remains separate.

grant is re-evaluated for each operation, with distinct readers, writers, feedbackWriters and
maintainers. Default private access is caller-local. Shared access must be explicit. canReadEvidence
can apply narrower current source policy; source intersections constrain derived recall. These
functions are trusted host code, not fields accepted from model output.

## Verification boundary

Behavioral suites cover representative delivery, privacy, time, lifecycle and storage failures.
There is no claim that every C01–C42 scenario from the protocol has been independently certified.
The implementation's experimental defaults and synchronous callback/storage contracts are not a
released network specification or production security assurance.

The standalone applyBatch helper cannot detect conflicting older batches without retained history
hashes. Hosts that need that detection must retain receipts/hashes or resynchronize from the service.
