# Contributing

Read AGENTS.md and docs/engineering/README.md. Use the pinned toolchain and package generators.
Keep library imports framework-neutral and document any protocol departure as experimental.

Use Conventional Commits and run pnpm verify. Meaningful behavior tests belong in the nearest tests/
directory; native-persistence cases use the separate integration target. Avoid generated filler tests,
spec-per-file rules and coverage quotas. Never use paid providers in ordinary checks.

Before a requested commit, review the complete candidate against the project's engineering and
experiment contracts. Do not present synthetic fixture accuracy as an improvement for real agents.

Install dependencies with pnpm install --frozen-lockfile to activate Husky. Use pnpm fix to organize
imports through ESLint and apply Prettier formatting, or pnpm lint:fix / pnpm format separately.
The pre-commit hook checks staged ESLint/formatting and affected lint, types and tests. It temporarily
hides and restores unstaged work, including untracked files; it does not auto-fix or silently add edits.
