# Tooling

Use pinned Node, pnpm, Nx and framework versions, one lockfile and frozen installs in CI.
Inspect installed generator schemas/source and preview generation before applying it.

Run pnpm format:check, lint, typecheck, test, test:integration and build through Nx; pnpm verify
combines them with built-artifact execution. ESLint owns platform boundaries, precise types, and
the 300-line cap. Prettier uses single quotes, width 100 and trailing commas. Keep UTF-8/LF files.

Live demos, experiments producing reports, servers and real-persistence integration targets are
uncached. Never cache SQLite/WAL/SHM files, .skein runtime state or reports. Cached builds declare
dependency inputs and ^build ordering. Tests include their fixtures in their inputs.

Husky checks formatting from staged contents, then affected lint/typecheck/tests. It does not
rewrite or stage files. Full build and integration checks remain in verify and GitHub Actions.
