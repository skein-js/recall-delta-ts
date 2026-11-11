# Experiment protocol

The warehouse PoC answers eight questions separately. An overall verdict is supported, failed or
inconclusive. Passing a deterministic mechanism does not establish a live-agent outcome.

| Question            | Frozen acceptance target                                                                                | Evidence produced offline                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1: Useful advantage | ≥10 pp task-success gain; paired 95% interval above zero; ≤1.5× p95 latency; ≤1.25× amortized cost      | Fixture task results, tool counts, descriptive family bootstrap; operating dollars unknown |
| 2: Changed memory   | 100% tracked dependency invalidation; ≥95% next-decision revision; zero stale committed actions         | Correction and stale-assumption trace; live revision rate untested                         |
| 3: Readiness        | Zero false-ready results; pending/completed/failed distinct; no duplicate effect after retry/restart    | Status/fault checks plus real SQLite reopening/crash gate                                  |
| 4: Reinforcement    | ≥5 pp recurring-task gain; rare-memory loss ≤2 pp; no wrong-episode increase or duplicate reinforcement | Twenty isolated repetitions of a controlled longitudinal stream and mechanism ablations    |
| 5: Poisoning        | Zero predefined attacker goals; complete lineage; no unauthorized sharing; benign loss ≤2 pp            | Four fixture attacks and tool guards; LLM/benign paired study unrun                        |
| 6: Revocation       | Zero newly served restricted payloads; stale state invalidated and authorization rechecked              | Engine history/replay/source denial and fresh model-context reconstruction                 |
| 7: Inspect/correct  | Complete lineage; ≥80% usability completion; median <180 s across five unfamiliar participants          | Local inspector; no participant results invented                                           |
| 8: Interoperability | Unchanged host/prompt; applicable core contracts pass; no fabricated fields                             | Hindsight documentation/mapping audit; no independently executed backend                   |

## Run and freeze

```sh
pnpm experiment
pnpm experiment --args="--freeze"
pnpm experiment --args="--heldout"
```

The default pilot uses 20 development families; the separate split contains 100 held-out families.
Each configuration runs three repetitions. Four comparisons and three ablations share the same
graph, tools, input and memory-formation policy, with fresh stores per family/repetition/configuration.
An ambiguous cue step precedes a distinguishing step, so carried activation is actually exercised.
Labels remain inside the evaluator wrapper and are never passed to the graph or memory engine.

The summary configuration is bounded recent history (latest four records), not an LLM-generated
summary. The context-only baseline can inspect current posting state and complete the task.
All examples are synthetic and generated from a small warehouse simulation; the split is useful
for harness discipline, not evidence of broad warehouse generalization or an independent real corpus.

Select the strongest baseline on development accuracy, then fewer tool calls and stable name order.
The write-once manifest records policy, fixture hash, provider label, limits, split and baseline.
Held-out execution refuses a missing or mismatching freeze. Changing a study requires a new study
directory and new untouched holdout data, not retuning against these held-out results.

Average repetitions within family before descriptive bootstrap. Do not treat three repeated runs
as three independent incidents. Report null operating cost rather than inventing dollars for local
fixture work. Raw timings are local runtime diagnostics, not a provider latency benchmark.

The historical context cap is conservatively 2,000 UTF-8 bytes for the ASCII fixtures. This is stricter
than the planned token allowance but is not a calibrated Vertex tokenizer. Each graph invocation
permits at most eight simulated diagnostic calls; case reports record cumulative calls across cue
steps. A live acceptance campaign must additionally enforce its total case budget and collect actual
provider token usage and full operating cost before evaluating the cost/token criteria.

## Scope of current evidence

The default fixture planner can solve this small simulation. Equal performance between baselines
and associative recall means the pilot has not demonstrated an accuracy benefit. Keep that negative
observation in the report. Model-assisted formation and semantic consolidation are intentionally absent.

The longitudinal probe reports top-1 hit rate separately from recall within the surfaced candidate
limit. Its twenty isolated repetitions share one controlled history template; they are not twenty
independent real-world studies. Sticky top ranking can coexist with a relevant memory remaining
available to the planner. Interpret both metrics before claiming reinforcement helped or harmed tasks.

The retention experiment counts every retained domain record, demonstrates a protected memory
surviving, rejects over-capacity admission, and prevents immediate re-encoding. It reports allocated
SQLite/WAL/SHM bytes separately: logical reclamation can coincide with increased allocated bytes.
Skein checkpoint bytes are host storage and must not be counted as reclaimed domain bytes.

Engine revocation does not sanitize raw operator-owned Skein checkpoint history. It prevents
revoked domain records from being read/replayed and prevents restored active context from reaching
the planner without reauthorization. A deployed multi-user history interface needs its own fence
or erasure implementation; question 6 stays inconclusive for that stronger end-to-end boundary.

## Human usability protocol

Recruit five consenting people unfamiliar with the implementation; no invitations are automated.
Give each person four tasks: inspect formation from a conversation, explain an incorrect recall,
submit/verify a correction, and inspect what remains after removal. Provide the commands, not the
answers. Record anonymous participant ID, task ID, success and durationSeconds. Preserve errors
and abandoned tasks. Technical lineage must also remain complete.

Provide those records as a JSON array with participantId, taskId (formation/explanation/correction/removal),
success and durationSeconds, then run `pnpm experiment --args="--usability /absolute/path/study.json"`.
The grader rejects duplicates and leaves incomplete participant/task sets inconclusive.

The study passes at ≥80% completed tasks and median time strictly below three minutes, with all five
participants represented. Until actual records exist, the human verdict is inconclusive.

## External backend

Read [the Hindsight audit](hindsight-audit.md). Documentation and recorded mapping tests cannot
establish live backend access, atomic sidecars, source policies or independent conformance. Do not
turn missing backend estimates into invented confidence or activation values.
