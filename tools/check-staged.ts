import { execFileSync } from 'node:child_process';
import * as prettier from 'prettier';
const paths = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
for (const path of paths) {
  const info = await prettier.getFileInfo(path, { ignorePath: '.prettierignore' });
  if (info.ignored || !info.inferredParser) continue;
  const source = execFileSync('git', ['show', `:${path}`], { encoding: 'utf8' });
  if (!(await prettier.check(source, { ...(await prettier.resolveConfig(path)), filepath: path })))
    throw new Error(`Staged formatting failed: ${path}`);
}
if (paths.length)
  execFileSync(
    'nx',
    ['affected', '-t', 'lint', 'typecheck', 'test', `--files=${paths.join(',')}`],
    { stdio: 'inherit' },
  );
