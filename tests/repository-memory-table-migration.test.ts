import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ProjectStore } from "../electron/persistence/project-store";
import {
  migrateLegacyRepositoryMemoryTables,
  RepositoryMemoryStore,
} from "../electron/persistence/repository-memory-store";

// Covers the temporary migration "repository-memory-tables"; delete this file
// together with it (see config/temporary-migrations.json).

describe("repository memory table rename", () => {
  test("moves path-scoped rows out of project_memories before projects create that table", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE project_memories (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source_task_id TEXT,
        source_turn_id TEXT,
        confidence REAL NOT NULL,
        created_at INTEGER NOT NULL,
        last_confirmed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      INSERT INTO project_memories VALUES (
        'mem-1', '/tmp/repo', 'fact', 'Keep the deploy window on Tuesday.',
        NULL, NULL, 0.9, 1, 1, 1, NULL
      );
      CREATE TABLE project_memory_settings (
        project_path TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        reset_before INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO project_memory_settings VALUES ('/tmp/repo', '{"useMemory":true}', 2, 0);
    `);

    migrateLegacyRepositoryMemoryTables(database);
    new ProjectStore(database);
    const store = new RepositoryMemoryStore(database);

    expect(store.get("mem-1")?.content).toBe("Keep the deploy window on Tuesday.");
    expect(store.get("mem-1")?.recallMode).toBe("contextual");
    expect(store.settings.get("/tmp/repo").revision).toBe(2);
    const projectColumns = database.prepare("PRAGMA table_info(project_memories)").all() as Array<{
      name: string;
    }>;
    expect(projectColumns.some((column) => column.name === "project_id")).toBe(true);
    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'project_memory_settings'").get(),
    ).toBeNull();
    database.close();
  });
});
