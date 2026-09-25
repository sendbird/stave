import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type NativeDatabase from "better-sqlite3";
import { NotificationStore } from "../electron/persistence/notification-store";
import type { PersistenceProjectRegistryEntry } from "../electron/persistence/types";

let database: Database;
let registry: PersistenceProjectRegistryEntry[];
let store: NotificationStore;

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, project_path TEXT, project_name TEXT,
      workspace_id TEXT, workspace_name TEXT, task_id TEXT, task_title TEXT,
      turn_id TEXT, provider_id TEXT, action_json TEXT, payload_json TEXT NOT NULL,
      source_dedupe_key TEXT UNIQUE, created_at TEXT NOT NULL, read_at TEXT,
      resolved_at TEXT, expires_at TEXT
    );
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
  `);
  registry = [];
  store = new NotificationStore(
    database as unknown as NativeDatabase.Database,
    () => registry,
  );
});

afterEach(() => database.close());

function createNotification(args: {
  id: string;
  kind?: "task.turn_completed" | "task.approval_requested";
  workspaceId?: string;
  providerId?: "stave" | "codex";
  dedupeKey?: string;
  createdAt?: string;
}) {
  return store.createNotification({
    notification: {
      id: args.id,
      kind: args.kind ?? "task.turn_completed",
      title: args.id,
      body: args.id,
      workspaceId: args.workspaceId,
      providerId: args.providerId,
      dedupeKey: args.dedupeKey,
      createdAt: args.createdAt,
    },
  });
}

describe("NotificationStore SQL boundary", () => {
  test("deduplicates inserts and reads legacy provider ids through the same row mapper", () => {
    const first = createNotification({
      id: "first",
      providerId: "stave",
      dedupeKey: "turn-1",
    });
    const duplicate = createNotification({
      id: "second",
      providerId: "codex",
      dedupeKey: "turn-1",
    });

    expect(first.inserted).toBe(true);
    expect(first.notification?.providerId).toBe("claude-code");
    expect(duplicate).toMatchObject({ inserted: false, notification: { id: "first" } });
    expect(store.listNotifications().map((row) => row.id)).toEqual(["first"]);
  });

  test("caps completed history, retains unresolved approval, then prunes expired read history", () => {
    createNotification({
      id: "approval",
      kind: "task.approval_requested",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    for (let index = 0; index < 55; index += 1) {
      createNotification({
        id: `completed-${String(index).padStart(2, "0")}`,
        createdAt: `2026-01-02T00:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }

    const retained = store.listNotifications().map((row) => row.id);
    expect(retained).toHaveLength(51);
    expect(retained).toContain("approval");
    expect(retained).toContain("completed-54");
    expect(retained).not.toContain("completed-04");

    store.markNotificationRead({ id: "completed-54", readAt: "2026-01-03T00:00:00.000Z" });
    expect(store.pruneNotifications({ now: "2026-02-01T00:00:00.000Z" })).toBe(1);
    expect(store.listNotifications().map((row) => row.id)).toContain("approval");
  });

  test("removes only true orphans using both workspace rows and the registry", () => {
    database.prepare("INSERT INTO workspaces (id) VALUES (?)").run("row-owned");
    registry = [{
      projectPath: "/tmp/project",
      projectName: "Project",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [{ id: "registry-owned", name: "Registry", updatedAt: "2026-01-01T00:00:00.000Z" }],
      activeWorkspaceId: "registry-owned",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
    }];
    for (const workspaceId of ["row-owned", "registry-owned", "orphan"]) {
      createNotification({ id: workspaceId, workspaceId });
    }

    expect(store.deleteOrphanedNotifications()).toEqual({
      count: 1,
      workspaceIds: ["orphan"],
    });
    expect(store.deleteOrphanedNotifications()).toEqual({ count: 0, workspaceIds: [] });
    expect(store.listNotifications().map((row) => row.id).sort()).toEqual([
      "registry-owned",
      "row-owned",
    ]);
  });
});
