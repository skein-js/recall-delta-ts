# Testing policy

Every test must protect a distinct behavior, contract, security/data-integrity invariant, or material
regression. Extend existing coverage where sufficient. No spec-per-file rule, construction tests,
configuration-text assertions, duplicate scenario matrices, or coverage quotas.

Use Vitest with nearby tests/ folders. Unit tests require no credentials or Docker. Real SQLite
rollback, reopening, and crash recovery belong to the separate integration target. Use a disposable
directory and restore/close resources. All model tests use local fakes; no automatic paid fallback.

Exclude tests/ from library output and production cache inputs; include it in test inputs. Verify
actual build output and Nx graph behavior rather than adding tests that regex-match configuration.

Fixture planner results prove orchestration only. Live effectiveness, poisoning resistance against
an LLM, human usability, and an independent backend require their own evidence. Unrun evaluations
are inconclusive. Keep evaluator labels outside graph and engine input.
