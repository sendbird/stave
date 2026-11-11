import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { dropRetiredSyncOutbox } from "../electron/persistence/retired-sync-outbox";

function listSchemaObjects(database: Database) {
  return database
    .query("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ type: string; name: string }>;
}

describe("dropRetiredSyncOutbox", () => {
  test("drops the retired outbox table and its indexes and keeps other tables", () => {
    const database = new Database(":memory:");
    // The shape the removed sync integration created before this release.
    database.exec(`
      CREATE TABLE martin_sync_outbox (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_ref TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        status TEXT NOT NULL
      );
      CREATE INDEX idx_martin_outbox_due
        ON martin_sync_outbox (status, next_attempt_at);
      CREATE INDEX idx_martin_outbox_workspace
        ON martin_sync_outbox (workspace_id, status);
      INSERT INTO martin_sync_outbox VALUES
        ('entry-1', 'ws-1', 'project', 'event', '{}', 0, 'now', 'now', NULL, 'pending');
      CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    `);

    dropRetiredSyncOutbox(database);

    expect(listSchemaObjects(database)).toEqual([
      { type: "table", name: "workspaces" },
    ]);
    database.close();
  });

  test("is a no-op on a database that never had the outbox", () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY);");

    dropRetiredSyncOutbox(database);
    dropRetiredSyncOutbox(database);

    expect(listSchemaObjects(database)).toEqual([
      { type: "table", name: "workspaces" },
    ]);
    database.close();
  });
});
