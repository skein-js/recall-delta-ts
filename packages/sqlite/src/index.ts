import { mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

import {
  emptyStoreState,
  type RecallStore,
  storageSchemaVersion,
  storeStateSchema,
} from '@skein-js/recall-delta/storage/v2';
import Database from 'better-sqlite3';

/** A deliberately small transactional JSON snapshot store, not a scalable database schema. */
export function createSqliteRecallStore(
  filename: string,
): RecallStore & { close(): void; allocatedBytes(): number } {
  if (!isAbsolute(filename)) throw new Error('SQLite filename must be absolute');
  mkdirSync(dirname(filename), { recursive: true });
  const database = new Database(filename, { timeout: 5000 });
  function read() {
    const row = database
      .prepare('SELECT schema_version, payload FROM recall_state WHERE id=1')
      .get();
    if (!row || typeof row !== 'object' || !('payload' in row) || typeof row.payload !== 'string')
      throw new Error('Invalid SQLite state row');
    if (!('schema_version' in row) || row.schema_version !== storageSchemaVersion)
      throw new Error(
        `Unsupported Recall Delta storage schema; expected ${storageSchemaVersion}. Explicit migration is required.`,
      );
    return storeStateSchema.parse(JSON.parse(row.payload));
  }
  try {
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = FULL');
    database.exec(
      'CREATE TABLE IF NOT EXISTS recall_state (id INTEGER PRIMARY KEY CHECK (id=1), schema_version INTEGER NOT NULL, payload TEXT NOT NULL)',
    );
    database
      .transaction(() => {
        const existing = database.prepare('SELECT id FROM recall_state WHERE id=1').get();
        if (!existing)
          database
            .prepare('INSERT INTO recall_state VALUES (1, ?, ?)')
            .run(storageSchemaVersion, JSON.stringify(emptyStoreState()));
        read();
      })
      .immediate();
  } catch (error) {
    database.close();
    throw error;
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
