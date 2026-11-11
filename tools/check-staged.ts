import { execFileSync, spawnSync } from 'node:child_process';

import { ESLint } from 'eslint';
import * as prettier from 'prettier';
function stagedPaths(filter: string): string[] {
  return execFileSync('git', ['diff', '--cached', '--name-only', `--diff-filter=${filter}`, '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}
const paths = stagedPaths('ACMR');
const affectedPaths = stagedPaths('ACMRD');
const eslint = new ESLint();
const formatter = await eslint.loadFormatter('stylish');
for (const path of paths) {
  const source = execFileSync('git', ['show', `:${path}`], { encoding: 'utf8' });
  const info = await prettier.getFileInfo(path, { ignorePath: '.prettierignore' });
  if (
    !info.ignored &&
    info.inferredParser &&
    !(await prettier.check(source, { ...(await prettier.resolveConfig(path)), filepath: path }))
  )
    throw new Error(`Staged formatting failed: ${path}. Run pnpm format, then stage the result.`);
  if (/\.(?:ts|mjs|cjs|js)$/.test(path)) {
    const results = await eslint.lintText(source, { filePath: path, warnIgnored: false });
    if (results.some((result) => result.errorCount > 0 || result.warningCount > 0)) {
      process.stderr.write(await formatter.format(results));
      throw new Error(`Staged ESLint failed: ${path}. Run pnpm lint:fix, then stage the result.`);
    }
  }
}
if (affectedPaths.length) {
  const result = spawnSync(
    'nx',
    [
      'affected',
      '-t',
      'lint',
      'typecheck',
      'test',
      `--files=${affectedPaths.join(',')}`,
      '--output-style=static',
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
