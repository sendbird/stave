/**
 * Main and the host-service each hold a connection to stave.sqlite. A unit
 * that reads before it writes must not start as a deferred transaction (a bare
 * top-level SAVEPOINT is one): a commit from the other process after its first
 * read fails its first write at once with SQLITE_BUSY, without waiting on
 * `busy_timeout`. At the top level this takes the write lock first
 * (BEGIN IMMEDIATE), so the other writer waits instead; inside a caller's
 * transaction it is a SAVEPOINT, which the outer transaction's lock covers.
 */
export interface WriteSavepointDatabase {
  exec(sql: string): unknown;
  readonly inTransaction: boolean;
}

export function inWriteSavepoint<T>(db: WriteSavepointDatabase, name: string, work: () => T): T {
  const topLevel = !db.inTransaction;
  db.exec(topLevel ? "BEGIN IMMEDIATE" : `SAVEPOINT ${name}`);
  try {
    const result = work();
    db.exec(topLevel ? "COMMIT" : `RELEASE ${name}`);
    return result;
  } catch (error) {
    if (!topLevel) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
    } else if (db.inTransaction) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
}
