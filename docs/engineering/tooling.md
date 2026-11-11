# Tooling

Use pinned Node, pnpm, Nx and framework versions, one lockfile and frozen installs in CI.
Inspect installed generator schemas/source and preview generation before applying it.

Run pnpm format:check, lint, typecheck, test, test:integration and build through Nx; pnpm verify
combines them with built-artifact execution. ESLint owns platform boundaries, precise types, and
the 300-line cap. ESLint simple-import-sort organizes imports/exports and consistent-type-imports
separates type-only imports. Prettier uses single quotes, width 100 and trailing commas. Keep UTF-8/LF files.

Live demos, experiments producing reports, servers and real-persistence integration targets are
uncached. Never cache SQLite/WAL/SHM files, .skein runtime state or reports. Cached builds declare
dependency inputs and ^build ordering. Tests include their fixtures in their inputs.

Husky is activated by pnpm install through the prepare script. Its uncached pre-commit target uses
lint-staged to back up and temporarily hide all unstaged changes, including untracked files, so the
checks see the staged source. It checks staged formatting and ESLint (including import organization),
then affected lint/typecheck/tests. It restores unstaged work afterward and fails if a task modifies
tracked source; checks do not auto-fix or silently stage edits. Full build and integration checks
remain in verify and GitHub Actions.

Run pnpm lint:fix to organize imports and apply ESLint fixes, pnpm format to format supported files,
or pnpm fix for both. Stage the intended result explicitly. VS Code recommends ESLint and Prettier
and applies their respective fixes/formatting on explicit save.
