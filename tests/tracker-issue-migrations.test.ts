import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { TrackerIssuesStore } from "../electron/persistence/tracker-issues-store";
import {
  migrateLegacyIssueStorageKeys,
  migrateLegacyIssueTrackerSettings,
} from "../src/lib/tracker-issues/legacy-settings";
import type {
  TrackerIssue,
  TrackerIssueStaveLink,
} from "../src/lib/tracker-issues/types";

// Covers the temporary migrations "tracker-issue-tables" and
// "issue-tracker-settings"; delete this file together with them (see
// config/temporary-migrations.json).

const issue: TrackerIssue = {
  source: "crane",
  ref: "task-1",
  key: "CRANE-1",
  title: "Fix the dispatch",
  url: "https://tracker.example.com/task/CRANE-1",
  status: { raw: "In Progress", category: "in_progress" },
  priority: { raw: "High", level: "high" },
  assignee: null,
  labels: [],
  dueDate: null,
  effort: null,
  project: null,
  team: null,
  parentKey: null,
  subtasks: null,
  issueType: null,
  links: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
  closedAt: null,
};

const kickoff: TrackerIssueStaveLink = {
  id: "kickoff-1",
  source: "crane",
  taskRef: "task-1",
  taskKey: "CRANE-1",
  workspaceId: "workspace-1",
  staveTaskId: null,
  craneJobId: null,
  state: "running",
  errorCode: null,
  createdAt: "2026-07-26T00:01:00.000Z",
  updatedAt: "2026-07-26T00:01:00.000Z",
};

/** A database exactly as a build from before the rename left it. */
function createLegacyDatabase() {
  const database = new Database(":memory:");
  const store = new TrackerIssuesStore(database);
  store.replaceSourceTasks("crane", [issue], "2026-07-26T00:02:00.000Z");
  store.upsertKickoff(kickoff);
  database.exec(`
    DROP INDEX idx_tracker_issues_cache_recent;
    DROP INDEX idx_tracker_issue_kickoffs_task;
    DROP INDEX idx_tracker_issue_kickoffs_crane_job;
    DROP INDEX idx_tracker_issue_kickoffs_stave_task;
    ALTER TABLE tracker_issues_cache RENAME TO tracker_tasks_cache;
    ALTER TABLE tracker_issue_kickoffs RENAME TO tracker_task_kickoffs;
    CREATE INDEX idx_tracker_tasks_cache_recent ON tracker_tasks_cache (source, task_updated_at DESC);
    CREATE INDEX idx_tracker_task_kickoffs_task ON tracker_task_kickoffs (source, task_ref);
    CREATE INDEX idx_tracker_task_kickoffs_crane_job ON tracker_task_kickoffs (crane_job_id);
    CREATE INDEX idx_tracker_task_kickoffs_stave_task ON tracker_task_kickoffs (stave_task_id);
  `);
  return database;
}

function schemaNames(database: Database, type: "table" | "index") {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
      .all(type) as Array<{ name: string }>
  )
    .map((row) => row.name)
    .filter((name) => !name.startsWith("sqlite_"));
}

describe("tracker issue table migration", () => {
  test("renames legacy tables and indexes and keeps cached issues and kickoffs", () => {
    const database = createLegacyDatabase();

    const store = new TrackerIssuesStore(database);

    expect(schemaNames(database, "table")).toEqual([
      "tracker_issue_kickoffs",
      "tracker_issues_cache",
    ]);
    expect(schemaNames(database, "index")).toEqual([
      "idx_tracker_issue_kickoffs_crane_job",
      "idx_tracker_issue_kickoffs_stave_task",
      "idx_tracker_issue_kickoffs_task",
      "idx_tracker_issues_cache_recent",
    ]);
    expect(store.listSourceTasks("crane").map((row) => row.key)).toEqual(["CRANE-1"]);
    expect(store.listKickoffs().map((row) => row.id)).toEqual(["kickoff-1"]);
  });

  test("is a no-op when run again", () => {
    const database = createLegacyDatabase();
    new TrackerIssuesStore(database);
    const store = new TrackerIssuesStore(database);
    expect(store.listSourceTasks("crane")).toHaveLength(1);
  });
});

describe("issue tracker settings migration", () => {
  test("moves the legacy settings key, shortcut override and recent commands", () => {
    const persisted: Record<string, unknown> = {
      trackerTasks: { refreshIntervalSeconds: 120 },
      appShortcutKeys: { "navigation.tasks": "j", "navigation.fleet-view": "f" },
      commandPaletteRecentCommandIds: [
        "tracker.refresh-tasks",
        "navigation.tasks",
        "navigation.issues",
      ],
    };

    migrateLegacyIssueTrackerSettings(persisted);

    expect(persisted.trackerTasks).toBeUndefined();
    expect(persisted.trackerIssues).toEqual({ refreshIntervalSeconds: 120 });
    expect(persisted.appShortcutKeys).toEqual({
      "navigation.issues": "j",
      "navigation.fleet-view": "f",
    });
    expect(persisted.commandPaletteRecentCommandIds).toEqual([
      "tracker.refresh-issues",
      "navigation.issues",
    ]);
  });

  test("keeps settings already saved under the new key", () => {
    const persisted: Record<string, unknown> = {
      trackerIssues: { refreshIntervalSeconds: 60 },
      trackerTasks: { refreshIntervalSeconds: 120 },
    };
    migrateLegacyIssueTrackerSettings(persisted);
    expect(persisted.trackerIssues).toEqual({ refreshIntervalSeconds: 60 });
    expect(persisted.trackerTasks).toBeUndefined();
  });

  test("tolerates a missing snapshot", () => {
    expect(() => migrateLegacyIssueTrackerSettings(undefined)).not.toThrow();
  });

  test("moves the local view preference keys once", () => {
    const values = new Map<string, string>([
      ["stave.tracker-tasks.view", '{"view":"board"}'],
      ["stave.tracker-tasks.last-project", '{"crane":"/tmp/repo"}'],
      ["stave.tracker-issues.last-project", '{"crane":"/tmp/newer"}'],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };

    migrateLegacyIssueStorageKeys(storage);

    expect([...values.keys()].sort()).toEqual([
      "stave.tracker-issues.last-project",
      "stave.tracker-issues.view",
    ]);
    expect(values.get("stave.tracker-issues.view")).toBe('{"view":"board"}');
    expect(values.get("stave.tracker-issues.last-project")).toBe('{"crane":"/tmp/newer"}');
  });
});
