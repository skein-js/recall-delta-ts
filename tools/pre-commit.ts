import lintStaged from 'lint-staged';

// Isolate the index so unstaged edits cannot hide type errors or supply missing source files.
const passed = await lintStaged({
  config: { '*': () => 'tsx tools/check-staged.ts' },
  concurrent: false,
  diffFilter: 'ACMRD',
  hideAll: true,
  failOnChanges: true,
});
if (!passed) process.exitCode = 1;
