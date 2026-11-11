# Contributing

Read AGENTS.md and docs/engineering/README.md. Use the pinned toolchain and package generators.
Keep library imports framework-neutral and document any protocol departure as experimental.

Use Conventional Commits and run pnpm verify. Meaningful behavior tests belong in the nearest tests/
directory; native-persistence cases use the separate integration target. Avoid generated filler tests,
spec-per-file rules and coverage quotas. Never use paid providers in ordinary checks.

Before a requested commit, review the complete candidate against the project's engineering and
experiment contracts. Do not present synthetic fixture accuracy as an improvement for real agents.
