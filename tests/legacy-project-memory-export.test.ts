// Covers the project-memory-export entry in config/temporary-migrations.json;
// delete this file with that migration.
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  exportLegacyProjectMemories,
  legacyProjectMemoryExportDir,
} from "../electron/persistence/legacy-project-memory-export";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function userDataDir() {
  const root = mkdtempSync(path.join(tmpdir(), "stave-project-memory-export-"));
  roots.push(root);
  return root;
}

/** The tables as the retired project store created them. */
function oldProjectDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, state TEXT NOT NULL, coordinator_task_id TEXT NOT NULL,
      body_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE project_memories (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL,
      body_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const project = (id: string, name: string) =>
    db
      .prepare("INSERT INTO projects (id, state, coordinator_task_id, body_json, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, "active", `coord-${id}`, JSON.stringify({ id, name, goal: "Ship the new dashboard.", repositoryPath: "/tmp/repo" }), "2026-09-26T10:00:00.000Z");
  const memory = (id: string, projectId: string, kind: string, status: string, content: string, createdAt: string) =>
    db
      .prepare("INSERT INTO project_memories (id, project_id, status, body_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, projectId, status, JSON.stringify({ id, projectId, kind, content, status, sourceMissionId: null, createdAt }), createdAt);
  project("project-1", "Design system move");
  memory("m-2", "project-1", "note", "accepted", "Billing table moved first.\nThe chart follows.", "2026-09-27T09:00:00.000Z");
  memory("m-1", "project-1", "decision", "accepted", "Use the new Table component everywhere.", "2026-09-26T11:00:00.000Z");
  memory("m-3", "project-1", "decision", "candidate", "Drop the legacy grid.", "2026-09-28T09:00:00.000Z");
  // A memory whose project row is gone still exports, under its id.
  memory("m-4", "project-gone", "note", "accepted", "Keep the old tokens until 1.0.", "2026-09-29T09:00:00.000Z");
  return db;
}

describe("project memory export (temporary migration)", () => {
  test("writes one markdown file per project from the old tables", () => {
    const userData = userDataDir();
    const exportDir = legacyProjectMemoryExportDir(userData);
    const logs: string[] = [];
    const result = exportLegacyProjectMemories({ database: oldProjectDatabase(), exportDir, log: (line) => logs.push(line) });

    expect(exportDir).toBe(path.join(userData, "exports", "project-memory"));
    expect(readdirSync(exportDir).sort()).toEqual(["project-1.md", "project-gone.md"]);
    expect(result.written).toHaveLength(2);
    expect(logs).toHaveLength(1);

    const markdown = readFileSync(path.join(exportDir, "project-1.md"), "utf8");
    expect(markdown).toStartWith("# Design system move\n");
    expect(markdown).toContain("- Goal: Ship the new dashboard.");
    expect(markdown).toContain("- Repository: /tmp/repo");
    // Accepted memories in the order they were recorded, each with kind and date.
    const accepted = markdown.slice(markdown.indexOf("## Accepted"), markdown.indexOf("## Candidates"));
    expect(accepted.indexOf("- (decision, 2026-09-26) Use the new Table component everywhere.")).toBeGreaterThan(-1);
    expect(accepted.indexOf("- (note, 2026-09-27) Billing table moved first.\n  The chart follows.")).toBeGreaterThan(
      accepted.indexOf("Use the new Table component"),
    );
    expect(markdown.slice(markdown.indexOf("## Candidates"))).toContain("- (decision, 2026-09-28) Drop the legacy grid.");

    expect(readFileSync(path.join(exportDir, "project-gone.md"), "utf8")).toStartWith("# Project project-gone\n");
  });

  test("is idempotent: an existing file is never rewritten", () => {
    const exportDir = legacyProjectMemoryExportDir(userDataDir());
    const db = oldProjectDatabase();
    exportLegacyProjectMemories({ database: db, exportDir });
    writeFileSync(path.join(exportDir, "project-1.md"), "edited by the user");

    const logs: string[] = [];
    const again = exportLegacyProjectMemories({ database: db, exportDir, log: (line) => logs.push(line) });
    expect(again.written).toEqual([]);
    expect(logs).toEqual([]);
    expect(readFileSync(path.join(exportDir, "project-1.md"), "utf8")).toBe("edited by the user");
  });

  test("writes nothing for a database that never had projects, or has no memories", () => {
    const exportDir = legacyProjectMemoryExportDir(userDataDir());
    expect(exportLegacyProjectMemories({ database: new Database(":memory:"), exportDir }).written).toEqual([]);

    const empty = new Database(":memory:");
    empty.exec("CREATE TABLE project_memories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, body_json TEXT NOT NULL, created_at TEXT NOT NULL)");
    expect(exportLegacyProjectMemories({ database: empty, exportDir }).written).toEqual([]);
    expect(existsSync(exportDir)).toBe(false);
  });

  test("a project id cannot write outside the export folder", () => {
    const exportDir = legacyProjectMemoryExportDir(userDataDir());
    const db = new Database(":memory:");
    db.exec("CREATE TABLE project_memories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, body_json TEXT NOT NULL, created_at TEXT NOT NULL)");
    db.prepare("INSERT INTO project_memories VALUES (?, ?, ?, ?, ?)").run(
      "m-1",
      "../escape",
      "accepted",
      JSON.stringify({ kind: "note", content: "Hello.", status: "accepted", createdAt: "2026-09-26T10:00:00.000Z" }),
      "2026-09-26T10:00:00.000Z",
    );
    exportLegacyProjectMemories({ database: db, exportDir });
    expect(readdirSync(exportDir)).toEqual(["__escape.md"]);
  });
});
