import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRecallDelta } from '@skein-js/recall-delta';
import { createSqliteRecallStore } from '@skein-js/recall-delta-sqlite';
const args = process.argv.slice(2).filter((value) => value !== '--');
const filename = args[0];
const argument = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
if (!filename) throw new Error('Usage: pnpm inspect -- /absolute/path/to/recall.sqlite');
if (!existsSync(filename)) throw new Error('The requested domain SQLite file does not exist');
const store = createSqliteRecallStore(resolve(filename));
try {
  const memory = createRecallDelta({
    store,
    context: {
      tenantId: argument('--tenant', 'demo'),
      scopeId: argument('--scope', 'private'),
      principalId: argument('--principal', 'alice'),
    },
    allowGlobalAccounting: true,
  });
  console.log(
    JSON.stringify(
      {
        inspection: memory.experimental.inspect(),
        accounting: memory.experimental.accounting(),
        allocatedBytes: store.allocatedBytes(),
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
