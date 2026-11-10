interface RetiredSyncOutboxDatabase {
  exec: (sql: string) => unknown;
}

// temporary-migration: drop-retired-sync-outbox
/**
 * Drops the outbox table of the removed Martin sync integration, with its
 * indexes. Idempotent, so it runs on every open until the migration expires.
 */
export function dropRetiredSyncOutbox(db: RetiredSyncOutboxDatabase) {
  db.exec(`
    DROP INDEX IF EXISTS idx_martin_outbox_due;
    DROP INDEX IF EXISTS idx_martin_outbox_workspace;
    DROP TABLE IF EXISTS martin_sync_outbox;
  `);
}
// end temporary-migration: drop-retired-sync-outbox
