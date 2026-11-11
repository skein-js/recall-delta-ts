# Hindsight compatibility audit

Checked 11 November 2026 against official [retain](https://hindsight.vectorize.io/1.0/developer/api/retain),
[recall](https://hindsight.vectorize.io/1.0/developer/api/recall) and
[operation lifecycle](https://hindsight.vectorize.io/1.0/developer/api/operations) documentation.

Retain/recall, document tracking and asynchronous status offer useful overlap. This audit did not
start Hindsight, access an account, reproduce a deployment, or establish implementation guarantees.

| Boundary | Required before an adapter is advertised                                                        |
| -------- | ----------------------------------------------------------------------------------------------- |
| Evidence | Preserve original admitted reports and map backend document references to their evidence IDs    |
| Identity | Explain how one interpretation retains its candidate ID across backend revisions                |
| Scores   | Declare an honest activation interpretation; preserve unavailable credibility estimates as null |
| Sessions | Provide transactional snapshots, diffs, request receipts and recovery in an authorized sidecar  |
| Privacy  | Recheck current caller/source grants across backend output, derivatives and sidecar history     |
| Feedback | Attribute private learning without automatically modifying shared learned state                 |

The example mapping audit resolves known document references and reports missing lineage. It does
not manufacture full candidates or claim core conformance. These gaps are unestablished mappings,
not claims that Hindsight categorically lacks the underlying features.

**Verdict: inconclusive.** No live adapter is enabled. A limited retrieval-only binding could be
useful later, but must identify its unsupported contract rather than silently substituting semantics.
