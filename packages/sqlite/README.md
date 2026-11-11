# @skein-js/recall-delta-sqlite

Node-only optional storage for @skein-js/recall-delta. Pass an absolute filename to
createSqliteRecallStore, then supply its result as the engine's store. Close the owned store on shutdown.

An immediate SQLite transaction atomically commits a validated, schema-versioned JSON snapshot.
WAL and synchronous FULL protect committed state; failed callbacks roll back. Unsupported stored
schemas fail validation. This simple layout is suitable for the PoC, not large-scale indexing.

allocatedBytes reports the database, WAL and SHM files. Logical payload eviction does not promise
that allocated files shrink. Use a separate filename from Skein's exclusively owned workflow file.

Run real rollback/reopening/process-loss checks with `pnpm exec nx test-integration sqlite`.
