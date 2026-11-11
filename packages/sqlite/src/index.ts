import { mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import Database from 'better-sqlite3';
import { emptyStoreState, storeStateSchema, type RecallStore } from '@skein-js/recall-delta';

/** A deliberately small transactional JSON snapshot store, not a scalable database schema. */
export function createSqliteRecallStore(
  filename: string,
): RecallStore & { close(): void; allocatedBytes(): number } {
  if (!isAbsolute(filename)) throw new Error('SQLite filename must be absolute');
  mkdirSync(dirname(filename), { recursive: true });
  const database = new Database(filename, { timeout: 5000 });
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
  database.exec(
    'CREATE TABLE IF NOT EXISTS recall_state (id INTEGER PRIMARY KEY CHECK (id=1), schema_version INTEGER NOT NULL CHECK (schema_version=1), payload TEXT NOT NULL)',
  );
  database
    .prepare('INSERT OR IGNORE INTO recall_state VALUES (1, 1, ?)')
    .run(JSON.stringify(emptyStoreState()));
  const rowSchema = storeStateSchema.transform((state) => state);
  function read() {
    const row = database.prepare('SELECT payload FROM recall_state WHERE id=1').get();
    if (!row || typeof row !== 'object' || !('payload' in row) || typeof row.payload !== 'string')
      throw new Error('Invalid SQLite state row');
    return rowSchema.parse(JSON.parse(row.payload));
  }
  return {
    durable: true,
    read,
    transact(operation) {
      return database
        .transaction(() => {
          const state = read();
          const result = operation(state);
          const valid = storeStateSchema.parse(state);
          database
            .prepare('UPDATE recall_state SET payload=? WHERE id=1')
            .run(JSON.stringify(valid));
          return structuredClone(result);
        })
        .immediate();
    },
    close: () => database.close(),
    allocatedBytes() {
      return [filename, `${filename}-wal`, `${filename}-shm`].reduce((sum, path) => {
        try {
          return sum + statSync(path).size;
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return sum;
          throw error;
        }
      }, 0);
    },
  };
}
