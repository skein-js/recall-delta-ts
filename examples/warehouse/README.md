# Warehouse investigation

From the workspace root, run `pnpm demo` for the native Skein journey or `pnpm dev` for the console.
The graph uses the same Recall Delta library as the framework-free example. Its default planner is
an explicitly labeled deterministic fixture. It never calls a provider unless Vertex is selected.

In the Skein console, choose warehouse and submit:

```json
{
  "runId": "console-investigation-1",
  "cues": ["north dispatch ERP discrepancy"],
  "observations": [
    {
      "observationId": "north-report-1",
      "kind": "document",
      "observedAt": "2026-11-11T10:00:00Z",
      "source": { "type": "incident-report", "id": "north-report-1" },
      "content": { "warehouse": "north", "diagnosis": "delayed-posting", "action": "wait-for-job" }
    }
  ],
  "system": {
    "warehouse": "north",
    "dispatchPosted": false,
    "erpUpdated": false,
    "postingJob": "pending"
  }
}
```

Use a new runId for each new external step; retain it only when retrying the same logical step.
Nodes carry stable operation keys across execution retries. The workflow keeps current candidates,
their versions, dependent assumptions, processing status, proposed actions and an inspectable trace.
Changed content/evidence invalidates assumptions; score-only changes do not pretend facts changed.
The action verifier reads authoritative simulated state and rechecks source access.

The native demo starts a north investigation, changes context to south, blocks the old delayed-job
action, then admits a correction and proposes posting the missing dispatch. Reports include each
Skein run's result. Workflow and domain SQLite databases have independent ownership and filenames.

Server state defaults to .skein/state.sqlite; memory defaults to .skein/recall.sqlite. Override the
domain directory with RECALL_DATA_DIR. The server uses the trusted local-demo/warehouse-private/
demo-user binding; it is not a remote multi-user authentication example. Inspect this binding with:

```sh
pnpm inspect --args="/absolute/path/to/recall.sqlite --tenant local-demo --scope warehouse-private --principal demo-user"
```

Native demo stores instead use demo/private/alice. Never point the domain adapter at Skein's file.

`pnpm demo:vertex` requires ADC plus GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION and VERTEX_MODEL.
For a manually started server, set RECALL_MODEL_PROVIDER=vertex explicitly. Environment configuration
does not prove access; the first model request can fail on credentials, region, model or quota.
There is no automatic fallback. The live demonstration caps itself at ten requests.

The provider receives only assembled current context, not the entire checkpoint history or evaluator
labels. Raw checkpoints and report files contain fixture observations; treat equivalent real data as
private and apply a separate host retention policy before any deployment.
