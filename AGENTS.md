# Recall Delta TypeScript

Read [engineering guidance](docs/engineering/README.md), then the relevant owning topic.
The approved experiment is [documented here](docs/experiments.md). The protocol repository remains
authoritative for draft.4 core semantics; experimental extensions are explicitly separate.

Every test must earn its cost. Add or update tests only for distinct behavior, contracts,
security/data integrity or a material regression. Prefer relevant existing coverage; do not
require a spec per file or blanket coverage quotas. A change may need no new tests. Preserve
valuable coverage and mandatory checks; follow [the testing policy](docs/engineering/testing.md).

Use pnpm and Nx. Libraries live under packages/, runnable examples under examples/.
Core is framework-neutral; SQLite is Node-only; examples depend on libraries, never conversely.
Use named exports, strict types, functional domain logic, and at most 300 nonblank/noncomment
lines per authored TypeScript file. Validate untrusted and persisted values with Zod.

Run pnpm verify before delivery. Use the repository-review skill before requested commits.
Use Conventional Commits. Never claim fixture decisions establish live model quality.
Never publish, deploy, or run paid providers without corresponding user authorization.
