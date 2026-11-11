# Architecture

TypeScript ESM, named exports, strict mode and noUncheckedIndexedAccess. Keep domain decisions pure;
inject clocks and keep storage, filesystem, and provider effects at edges. Do not mutate caller-owned
inputs. Validate requests, provider output, configuration, and persisted records with Zod.

Organize by responsibility within the owning feature. Keep authored TypeScript at most 300
nonblank/noncomment lines. Avoid general-purpose utils/services directories and re-export chains.

core owns protocol schemas and reference-engine behavior. sqlite depends on core and owns durable
transactions. warehouse depends on both and owns LangGraph, Skein, simulated tools, and Vertex.
Nx platform tags and ESLint import restrictions enforce these boundaries. Use package entry points,
workspace:* dependencies, and supported library generators; never import another repository by path.

The SQLite adapter deliberately stores a versioned JSON snapshot under an immediate transaction.
This gives an inspectable atomic PoC boundary, not scalable per-record indexing or migrations for
other schema versions. The reference-engine SPI is exported under storage/v2, separate from the
portable nine-operation client and explicit experimental capability interfaces. Schema 2 persists
scope kind/ownership and primary interpretation relationships. Older snapshots require an explicit,
authorized migration; never infer their original audience from a new binding. Skein owns a separate
SQLite file.

Only trusted host bindings establish principal/scope/grants. The demo uses fixed fixture identities;
it supplies no production authentication server. Source content never supplies authority.
Private feedback remains in a caller overlay. Revocation is deliberately conservative: invalidate
all sessions in the affected scope and require a fresh session. Document this as an extension.
