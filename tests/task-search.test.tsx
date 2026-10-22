import { afterEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { TurnDigestStore } from "../electron/persistence/turn-digest-store";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { Command, CommandList } from "@/components/ui";
import {
  describeTaskSearchPlace,
  filterSectionsForTaskScope,
  renderTaskSearchGroup,
} from "@/components/layout/command-palette-task-search";
import { searchTasks, type TaskSearchSource } from "../electron/persistence/task-search";
import { SearchTasksArgsSchema, type TaskSearchResult } from "@/lib/task-search/task-search-ipc";
import type {
  PersistenceRepositoryRegistryEntry,
  PersistenceTaskRow,
  PersistenceTurnSummary,
} from "../electron/persistence/types";

afterEach(() => applyAppLocale("en"));

function repository(path: string, name: string, workspaces: Array<{ id: string; name: string; branch?: string; path?: string; isDefault?: boolean }>): PersistenceRepositoryRegistryEntry {
  return {
    repositoryPath: path,
    repositoryName: name,
    lastOpenedAt: "2026-10-01T00:00:00.000Z",
    defaultBranch: "main",
    workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, updatedAt: "2026-10-01T00:00:00.000Z" })),
    activeWorkspaceId: workspaces[0]!.id,
    workspaceBranchById: Object.fromEntries(workspaces.flatMap((workspace) => (workspace.branch ? [[workspace.id, workspace.branch]] : []))),
    workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.path ?? path])),
    workspaceDefaultById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, Boolean(workspace.isDefault)])),
  };
}

function task(id: string, title: string, updatedAt: string, archivedAt: string | null = null): PersistenceTaskRow {
  return { id, title, provider: "claude-code", updatedAt, unread: false, archivedAt };
}

const REGISTRY = [
  repository("/repos/shop", "shop", [
    { id: "ws-shop", name: "Default Workspace", branch: "main", isDefault: true },
    { id: "ws-shop-search", name: "search", branch: "feat/search", path: "/repos/shop/.stave/workspaces/search" },
  ]),
  repository("/repos/docs", "docs", [{ id: "ws-docs", name: "Default Workspace", branch: "main", isDefault: true }]),
];
const TASKS: Record<string, PersistenceTaskRow[]> = {
  "ws-shop": [task("t1", "Fix the login redirect", "2026-10-20T10:00:00.000Z")],
  "ws-shop-search": [
    task("t2", "Fix the login redirect", "2026-10-21T10:00:00.000Z"),
    task("t3", "Rank results by recency", "2026-10-19T10:00:00.000Z"),
  ],
  "ws-docs": [
    task("t4", "Write the login guide", "2026-10-18T10:00:00.000Z"),
    task("t5", "Old login notes", "2026-10-17T10:00:00.000Z", "2026-10-17T12:00:00.000Z"),
  ],
  // A workspace no repository registers any more.
  "ws-gone": [task("t6", "Fix the login redirect", "2026-10-22T10:00:00.000Z")],
};
const TURNS: Record<string, PersistenceTurnSummary> = {
  t1: { id: "turn-1", workspaceId: "ws-shop", taskId: "t1", providerId: "claude-code", createdAt: "x", completedAt: "y", usage: null, terminalReceipt: { outcome: "failed" } as never },
  t2: { id: "turn-2", workspaceId: "ws-shop-search", taskId: "t2", providerId: "claude-code", createdAt: "x", completedAt: null, usage: null },
  t3: { id: "turn-3", workspaceId: "ws-shop-search", taskId: "t3", providerId: "claude-code", createdAt: "x", completedAt: "y", usage: null, terminalReceipt: { outcome: "completed" } as never },
};
const SOURCE: TaskSearchSource = {
  loadRepositoryRegistry: () => REGISTRY,
  listWorkspaceTasks: ({ workspaceId }) => TASKS[workspaceId] ?? [],
  listTurns: ({ taskId }) => (TURNS[taskId] ? [TURNS[taskId]!] : []),
};

describe("searching every repository's tasks", () => {
  test("finds a task by title in any registered workspace, opened or not, and tells same titles apart by path", () => {
    const results = searchTasks(SOURCE, { query: "fix login" });
    expect(results.map((result) => [result.taskId, result.workspaceId, result.workspacePath, result.state])).toEqual([
      ["t2", "ws-shop-search", "/repos/shop/.stave/workspaces/search", "running"],
      ["t1", "ws-shop", "/repos/shop", "failed"],
    ]);
    expect(results.map(describeTaskSearchPlace)).toEqual([
      "shop › search (feat/search) · /repos/shop/.stave/workspaces/search",
      "shop › Default workspace (main) · /repos/shop",
    ]);
  });

  test("matches workspace, branch and repository names too, titles first", () => {
    expect(searchTasks(SOURCE, { query: "feat/search" }).map((result) => result.taskId)).toEqual(["t2", "t3"]);
    expect(searchTasks(SOURCE, { query: "docs" }).map((result) => result.taskId)).toEqual(["t4"]);
    const login = searchTasks(SOURCE, { query: "login" }).map((result) => result.taskId);
    expect(login).toEqual(["t2", "t1", "t4"]);
  });

  test("leaves out archived tasks unless asked and unregistered workspaces always; an empty query lists the latest", () => {
    expect(searchTasks(SOURCE, { query: "old login" })).toEqual([]);
    expect(searchTasks(SOURCE, { query: "old login", includeArchived: true }).map((result) => [result.taskId, result.state])).toEqual([["t5", "archived"]]);
    expect(searchTasks(SOURCE, { query: "" }).map((result) => result.taskId)).toEqual(["t2", "t1", "t3", "t4"]);
    expect(searchTasks(SOURCE, { query: "", limit: 2 })).toHaveLength(2);
    expect(searchTasks(SOURCE, { query: "rank" })[0]?.state).toBe("completed");
    expect(searchTasks(SOURCE, { query: "guide" })[0]?.state).toBe("new");
  });

  test("the request is validated", () => {
    expect(SearchTasksArgsSchema.safeParse({ query: "x", limit: 51 }).success).toBe(false);
    expect(SearchTasksArgsSchema.safeParse({ query: "x", extra: true }).success).toBe(false);
    expect(SearchTasksArgsSchema.safeParse({ query: "x", limit: 10, includeArchived: true }).success).toBe(true);
  });
});

describe("searching the app database", () => {
  function harness() {
    const db = new Database(":memory:");
    const store = Object.create(SqliteStore.prototype) as SqliteStore;
    Object.assign(store, { db, _closed: false });
    (store as unknown as { bootstrap: () => void }).bootstrap();
    Object.assign(store, {
      usageStatistics: new UsageStatisticsStore(db as never),
      turnDigests: new TurnDigestStore(db as never),
    });
    const insert = (workspaceId: string, taskId: string, title: string, updatedAt: string, archivedAt: string | null = null) =>
      db.run("INSERT INTO tasks (id, workspace_id, title, provider, updated_at, archived_at) VALUES (?, ?, ?, 'codex', ?, ?)",
        [`${workspaceId}:${taskId}`, workspaceId, title, updatedAt, archivedAt]);
    insert("ws-shop", "t1", "Fix the login redirect", "2026-10-20T10:00:00.000Z");
    // Never opened in this session: its tasks exist only in the database.
    insert("ws-shop-search", "t2", "Fix the login redirect", "2026-10-21T10:00:00.000Z");
    insert("ws-shop-search", "t3", "Old notes", "2026-10-19T10:00:00.000Z", "2026-10-19T12:00:00.000Z");
    store.saveRepositoryRegistry({ repositories: [REGISTRY[0]!] });
    store.beginTurn({ id: "turn-t2", workspaceId: "ws-shop-search", taskId: "t2", providerId: "codex", createdAt: "2026-10-21T10:00:00.000Z" });
    return { db, store };
  }

  test("reads tasks of every registered workspace from the database, with their latest turn's state", () => {
    const { db, store } = harness();
    expect(searchTasks(store, { query: "login" }).map((result) => [result.workspaceId, result.taskId, result.state])).toEqual([
      ["ws-shop-search", "t2", "running"],
      ["ws-shop", "t1", "new"],
    ]);
    expect(searchTasks(store, { query: "notes" })).toEqual([]);
    db.close();
  });

  test("goes through the validated IPC handler", async () => {
    const { store } = harness();
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
    mock.module("electron", () => ({
      ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
    }));
    mock.module("../electron/main/state", () => ({ ensurePersistenceReady: async () => store }));
    const { registerTaskSearchHandlers } = await import("../electron/main/ipc/task-search");
    registerTaskSearchHandlers();
    const handler = handlers.get("persistence:search-tasks")!;
    expect(await handler(null, { query: "login", limit: 1 })).toMatchObject({ ok: true, results: [{ taskId: "t2" }] });
    expect(await handler(null, { query: 3 })).toMatchObject({ ok: false });
  });
});

describe("the palette's task scope", () => {
  const sections = [
    { key: "navigation", items: [{ id: "navigation.fleet-view" }, { id: "task.select.t1" }, { id: "workspace.select.ws" }] },
    { key: "tasks-only", items: [{ id: "task.select.t2" }] },
  ];

  test("All repositories trades this workspace's task rows for the search and keeps Fleet's row", () => {
    expect(filterSectionsForTaskScope(sections, "workspace")).toEqual(sections);
    expect(filterSectionsForTaskScope(sections, "all")).toEqual([
      { key: "navigation", items: [{ id: "navigation.fleet-view" }, { id: "workspace.select.ws" }] },
    ]);
  });

  test("results show repository, workspace and path, state and last activity, in English and Korean", () => {
    const results = searchTasks(SOURCE, { query: "fix login" }) as TaskSearchResult[];
    const render = () =>
      renderToStaticMarkup(
        createElement(Command, null, createElement(CommandList, null,
          renderTaskSearchGroup({ search: { status: "ready", results }, query: "fix login", onOpen: () => {} }))),
      );
    const html = render();
    expect(html).toContain("Tasks in all repositories");
    expect(html.match(/data-task-search-result/g)).toHaveLength(2);
    expect(html).toContain("shop › search (feat/search)");
    expect(html).toContain("Running");
    expect(html).toContain("Failed");
    applyAppLocale("ko");
    expect(render()).toContain("모든 저장소의 작업");
    const none = renderToStaticMarkup(
      createElement(Command, null, createElement(CommandList, null,
        renderTaskSearchGroup({ search: { status: "ready", results: [] }, query: "zzz", onOpen: () => {} }))),
    );
    expect(none).toContain("“zzz”");
  });
});
