import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import type { PersistenceWorkspaceSnapshot } from "../electron/persistence/types";

const canRunNativeSqlite = typeof Bun === "undefined";
const nativeSqliteTest = canRunNativeSqlite ? test : test.skip;

async function loadSqliteStore() {
  const mod = await import("../electron/persistence/sqlite-store");
  return mod.SqliteStore;
}

function createSnapshot(): PersistenceWorkspaceSnapshot {
  return {
    version: 1,
    activeTaskId: "task-1",
    activeSurface: {
      kind: "cli-session",
      cliSessionTabId: "cli-1",
    },
    tasks: [
      {
        id: "task-1",
        title: "Task One",
        provider: "claude-code",
        updatedAt: "2026-03-06T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
      {
        id: "task-2",
        title: "Task Two",
        provider: "codex",
        updatedAt: "2026-03-06T00:10:00.000Z",
        unread: false,
        archivedAt: "2026-03-06T00:11:00.000Z",
      },
    ],
    messagesByTask: {
      "task-1": [
        {
          id: "m-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "hello",
          isStreaming: false,
          parts: [{ type: "text", text: "hello" }],
        },
      ],
      "task-2": [],
    },
    terminalTabs: [{
      id: "terminal-1",
      title: "project",
      linkedTaskId: null,
      backend: "ghostty",
      cwd: "/tmp/project",
      createdAt: 1,
    }],
    activeTerminalTabId: "terminal-1",
    cliSessionTabs: [{
      id: "cli-1",
      title: "Claude Workspace",
      provider: "claude-code",
      contextMode: "workspace",
      linkedTaskId: null,
      linkedTaskTitle: null,
      handoffSummary: "",
      cwd: "/tmp/project",
      createdAt: 2,
    }],
    activeCliSessionTabId: "cli-1",
  };
}

describe("SqliteStore", () => {
  let rootDir = "";
  let dbPath = "";

  beforeEach(() => {
    rootDir = path.join(tmpdir(), `stave-sqlite-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(rootDir, { recursive: true });
    dbPath = path.join(rootDir, "app.sqlite");
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  nativeSqliteTest("recovers workspace snapshot and turn summaries across restart", async () => {
    const SqliteStore = await loadSqliteStore();
    const snapshot = createSnapshot();
    const turnId = "turn-restart-1";

    {
      const store = new SqliteStore({ dbPath });
      store.upsertWorkspace({
        id: "ws-1",
        name: "Workspace One",
        snapshot,
      });
      store.beginTurn({
        id: turnId,
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-06T01:00:00.000Z",
      });
      store.completeTurn({ id: turnId, completedAt: "2026-03-06T01:00:03.000Z" });
      store.close();
    }

    const reopened = new SqliteStore({ dbPath });
    const summaries = reopened.listWorkspaceSummaries();
    const loaded = reopened.loadWorkspaceSnapshot({ workspaceId: "ws-1" });
    reopened.close();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe("ws-1");
    expect(loaded).toEqual(snapshot);
    expect(reopened.listTurns({ workspaceId: "ws-1", taskId: "task-1" })[0]).toMatchObject({
      id: turnId,
    });
  });

  nativeSqliteTest("purges legacy turn journals and turn payload artifacts on boot", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });
    store.beginTurn({
      id: "turn-legacy",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:00.000Z",
    });
    store.close();

    const artifactDir = path.join(rootDir, "artifacts", "turn-events");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      path.join(artifactDir, "legacy-turn-payload.json"),
      JSON.stringify({ type: "text", text: "legacy" }),
      "utf8",
    );

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO artifacts (id, kind, relative_path, byte_size, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "artifact-legacy",
      "turn_event_payload",
      "turn-events/legacy-turn-payload.json",
      24,
      "2026-03-06T01:00:01.000Z",
    );
    db.prepare(`
      INSERT INTO turn_events (id, turn_id, sequence, event_type, payload_json, payload_artifact_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "event-legacy",
      "turn-legacy",
      1,
      "text",
      JSON.stringify({ type: "text", text: "legacy" }),
      "artifact-legacy",
      "2026-03-06T01:00:01.000Z",
    );
    db.close();

    const reopened = new SqliteStore({ dbPath });
    reopened.close();

    const verifyDb = new Database(dbPath, { readonly: true });
    const turnEventCount = (
      verifyDb.prepare("SELECT COUNT(*) AS count FROM turn_events").get() as {
        count: number;
      }
    ).count;
    const legacyArtifactCount = (
      verifyDb
        .prepare("SELECT COUNT(*) AS count FROM artifacts WHERE kind = ?")
        .get("turn_event_payload") as { count: number }
    ).count;
    const purgeMarker = verifyDb
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get("legacy_turn_journal_purged_v1") as
      | { value_json: string }
      | undefined;
    verifyDb.close();

    expect(turnEventCount).toBe(0);
    expect(legacyArtifactCount).toBe(0);
    expect(purgeMarker).toBeTruthy();
    expect(existsSync(path.join(artifactDir, "legacy-turn-payload.json"))).toBe(
      false,
    );
  });

  nativeSqliteTest("lists the latest turn for each task in a workspace", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.beginTurn({
      id: "turn-task-1-old",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:00.000Z",
    });
    store.beginTurn({
      id: "turn-task-1-new",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:02.000Z",
    });
    store.beginTurn({
      id: "turn-task-2",
      workspaceId: "ws-1",
      taskId: "task-2",
      providerId: "claude-code",
      createdAt: "2026-03-06T01:00:01.000Z",
    });

    const turns = store.listLatestTurnsForWorkspace({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.id)).toEqual([
      "turn-task-1-new",
      "turn-task-2",
    ]);

    store.close();
  });

  nativeSqliteTest("lists the latest active turn for each task even when a newer completed turn exists", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.beginTurn({
      id: "turn-task-1-active",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:00.000Z",
    });
    store.beginTurn({
      id: "turn-task-1-completed",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:02.000Z",
    });
    store.completeTurn({
      id: "turn-task-1-completed",
      completedAt: "2026-03-06T01:00:03.000Z",
    });
    store.beginTurn({
      id: "turn-task-2-active",
      workspaceId: "ws-1",
      taskId: "task-2",
      providerId: "claude-code",
      createdAt: "2026-03-06T01:00:01.000Z",
    });

    const turns = store.listActiveTurnsForWorkspace({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.id)).toEqual([
      "turn-task-2-active",
      "turn-task-1-active",
    ]);
    expect(turns.every((turn) => turn.completedAt === null)).toBe(true);

    store.close();
  });

  nativeSqliteTest("loads workspace shell and paged task messages without dropping preserved tasks", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task One",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
          {
            id: "task-2",
            title: "Task Two",
            provider: "codex",
            updatedAt: "2026-03-06T00:10:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
            {
              id: "m-2",
              role: "assistant",
              model: "claude-opus-4-6",
              providerId: "claude-code",
              content: "world",
              isStreaming: false,
              parts: [{ type: "text", text: "world" }],
            },
          ],
          "task-2": [
            {
              id: "m-3",
              role: "user",
              model: "user",
              providerId: "user",
              content: "keep me",
              isStreaming: false,
              parts: [{ type: "text", text: "keep me" }],
            },
          ],
        },
      },
    });

    const shell = store.loadWorkspaceShell({ workspaceId: "ws-1" });
    const latestTaskOne = store.loadTaskMessagesPage({
      workspaceId: "ws-1",
      taskId: "task-1",
      limit: 1,
      offset: 0,
    });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        activeTaskId: "task-1",
        tasks: shell?.tasks ?? [],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
            {
              id: "m-2",
              role: "assistant",
              model: "claude-opus-4-6",
              providerId: "claude-code",
              content: "world",
              isStreaming: false,
              parts: [{ type: "text", text: "world" }],
            },
            {
              id: "m-4",
              role: "user",
              model: "user",
              providerId: "user",
              content: "new tail",
              isStreaming: false,
              parts: [{ type: "text", text: "new tail" }],
            },
          ],
        },
      },
    });

    const preservedTaskTwo = store.loadTaskMessagesPage({
      workspaceId: "ws-1",
      taskId: "task-2",
      limit: 10,
      offset: 0,
    });
    const updatedShell = store.loadWorkspaceShell({ workspaceId: "ws-1" });
    const fullSnapshot = store.loadWorkspaceSnapshot({ workspaceId: "ws-1" });

    expect(shell?.messageCountByTask).toEqual({
      "task-1": 2,
      "task-2": 1,
    });
    expect(latestTaskOne?.messages.map((message) => message.id)).toEqual(["m-2"]);
    expect(latestTaskOne?.totalCount).toBe(2);
    expect(preservedTaskTwo?.messages.map((message) => message.id)).toEqual(["m-3"]);
    expect(updatedShell?.messageCountByTask).toEqual({
      "task-1": 3,
      "task-2": 1,
    });
    expect(fullSnapshot?.messagesByTask["task-2"]?.map((message) => message.id)).toEqual(["m-3"]);

    store.close();
  });

  nativeSqliteTest("loads a thin workspace shell summary without replaying full shell payloads", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        ...createSnapshot(),
        editorTabs: [{
          id: "editor-1",
          filePath: "/tmp/project/src/app.ts",
          language: "typescript",
          content: "x".repeat(20_000),
          hasConflict: false,
          isDirty: true,
        }],
      },
    });
    store.close();

    const reopened = new SqliteStore({ dbPath });
    const summary = reopened.loadWorkspaceShellSummary({ workspaceId: "ws-1" });
    reopened.close();

    expect(summary).toEqual({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task One",
          provider: "claude-code",
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-2",
          title: "Task Two",
          provider: "codex",
          updatedAt: "2026-03-06T00:10:00.000Z",
          unread: false,
          archivedAt: "2026-03-06T00:11:00.000Z",
        },
      ],
      messageCountByTask: {
        "task-1": 1,
        "task-2": 0,
      },
      terminalTabCount: 1,
      cliSessionTabCount: 1,
    });
  });

  nativeSqliteTest("loads a workspace shell lite payload without replaying editor bodies", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        ...createSnapshot(),
        promptDraftByTask: {
          "task-1": {
            text: "draft",
            attachedFilePaths: [],
            attachments: [],
          },
        },
        providerSessionByTask: {
          "task-1": {
            "claude-code": "session-claude",
          },
        },
        editorTabs: [{
          id: "editor-1",
          filePath: "/tmp/project/src/app.ts",
          language: "typescript",
          content: "x".repeat(20_000),
          hasConflict: false,
          isDirty: true,
        }],
      },
    });
    store.close();

    const reopened = new SqliteStore({ dbPath });
    const shellLite = reopened.loadWorkspaceShellLite({ workspaceId: "ws-1" });
    reopened.close();

    expect(shellLite).toEqual({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task One",
          provider: "claude-code",
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-2",
          title: "Task Two",
          provider: "codex",
          updatedAt: "2026-03-06T00:10:00.000Z",
          unread: false,
          archivedAt: "2026-03-06T00:11:00.000Z",
        },
      ],
      promptDraftByTask: {
        "task-1": {
          text: "draft",
          attachedFilePaths: [],
          attachments: [],
        },
      },
      providerSessionByTask: {
        "task-1": {
          "claude-code": "session-claude",
        },
      },
      messageCountByTask: {
        "task-1": 1,
        "task-2": 0,
      },
    });
  });

  nativeSqliteTest("loads restore shells with only the active clean file tab hydrated", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });
    const largeBody = "x".repeat(96_000);

    store.upsertWorkspace({
      id: "ws-restore",
      name: "Restore Workspace",
      snapshot: {
        ...createSnapshot(),
        editorTabs: [
          {
            id: "file:/tmp/project/src/active.ts",
            filePath: "/tmp/project/src/active.ts",
            language: "typescript",
            content: largeBody,
            originalContent: largeBody,
            savedContent: largeBody,
            hasConflict: false,
            isDirty: false,
          },
          {
            id: "file:/tmp/project/src/other.ts",
            filePath: "/tmp/project/src/other.ts",
            language: "typescript",
            content: `${largeBody}-other`,
            originalContent: `${largeBody}-other`,
            savedContent: `${largeBody}-other`,
            hasConflict: false,
            isDirty: false,
          },
        ],
        activeEditorTabId: "file:/tmp/project/src/active.ts",
      },
    });
    store.close();

    const reopened = new SqliteStore({ dbPath });
    const shell = reopened.loadWorkspaceShellForRestore({
      workspaceId: "ws-restore",
    });
    const bodies = reopened.loadWorkspaceEditorTabBodies({
      workspaceId: "ws-restore",
      tabIds: ["file:/tmp/project/src/other.ts"],
    });
    reopened.close();

    expect(shell?.editorTabs).toEqual([
      {
        id: "file:/tmp/project/src/active.ts",
        filePath: "/tmp/project/src/active.ts",
        language: "typescript",
        content: largeBody,
        contentState: "ready",
        originalContent: largeBody,
        savedContent: largeBody,
        hasConflict: false,
        isDirty: false,
      },
      {
        id: "file:/tmp/project/src/other.ts",
        filePath: "/tmp/project/src/other.ts",
        language: "typescript",
        content: "",
        contentState: "deferred",
        hasConflict: false,
        isDirty: false,
      },
    ]);
    expect(bodies).toEqual([
      {
        id: "file:/tmp/project/src/other.ts",
        content: `${largeBody}-other`,
        originalContent: `${largeBody}-other`,
        savedContent: `${largeBody}-other`,
      },
    ]);
  });

  nativeSqliteTest("keeps tasks and messages when a later snapshot omits existing tasks", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task One",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
          {
            id: "task-2",
            title: "Task Two",
            provider: "codex",
            updatedAt: "2026-03-06T00:10:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
          ],
          "task-2": [
            {
              id: "m-2",
              role: "assistant",
              model: "gpt-5.4",
              providerId: "codex",
              content: "keep me",
              isStreaming: false,
              parts: [{ type: "text", text: "keep me" }],
            },
          ],
        },
      },
    });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task One",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:20:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
            {
              id: "m-3",
              role: "assistant",
              model: "claude-opus-4-6",
              providerId: "claude-code",
              content: "updated",
              isStreaming: false,
              parts: [{ type: "text", text: "updated" }],
            },
          ],
        },
      },
    });

    const persistedTasks = store.listWorkspaceTasks({ workspaceId: "ws-1" });
    const shell = store.loadWorkspaceShell({ workspaceId: "ws-1" });
    const taskTwoMessages = store.loadTaskMessagesPage({
      workspaceId: "ws-1",
      taskId: "task-2",
      limit: 10,
      offset: 0,
    });
    const snapshot = store.loadWorkspaceSnapshot({ workspaceId: "ws-1" });

    expect(persistedTasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);
    expect(shell?.tasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);
    expect(taskTwoMessages?.messages.map((message) => message.id)).toEqual(["m-2"]);
    expect(snapshot?.tasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);

    store.close();
  });

  nativeSqliteTest("removes task state only through explicit task removal", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.upsertWorkspace({
      id: "ws-1",
      name: "Workspace One",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task One",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
          {
            id: "task-2",
            title: "Task Two",
            provider: "codex",
            updatedAt: "2026-03-06T00:10:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [],
          "task-2": [
            {
              id: "m-2",
              role: "assistant",
              model: "gpt-5.4",
              providerId: "codex",
              content: "remove me",
              isStreaming: false,
              parts: [{ type: "text", text: "remove me" }],
            },
          ],
        },
      },
    });
    store.beginTurn({
      id: "turn-task-2",
      workspaceId: "ws-1",
      taskId: "task-2",
      providerId: "codex",
      createdAt: "2026-03-06T00:12:00.000Z",
    });

    store.removeTaskFromWorkspace({ workspaceId: "ws-1", taskId: "task-2" });

    const persistedTasks = store.listWorkspaceTasks({ workspaceId: "ws-1" });
    const shell = store.loadWorkspaceShell({ workspaceId: "ws-1" });
    const taskTwoMessages = store.loadTaskMessagesPage({
      workspaceId: "ws-1",
      taskId: "task-2",
      limit: 10,
      offset: 0,
    });
    const snapshot = store.loadWorkspaceSnapshot({ workspaceId: "ws-1" });
    const turns = store.listTurns({ workspaceId: "ws-1", taskId: "task-2" });

    expect(persistedTasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(shell?.tasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(taskTwoMessages?.messages).toEqual([]);
    expect(snapshot?.tasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(snapshot?.messagesByTask["task-2"]).toBeUndefined();
    expect(turns).toEqual([]);

    store.close();
  });

  nativeSqliteTest("stores notification history with dedupe and read state", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    const first = store.createNotification({
      notification: {
        id: "notification-task-complete",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:00.000Z",
      },
    });
    const duplicate = store.createNotification({
      notification: {
        id: "notification-task-complete-duplicate",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:05.000Z",
      },
    });
    const approval = store.createNotification({
      notification: {
        id: "notification-approval",
        kind: "task.approval_requested",
        title: "Refactor notifications",
        body: "Bash: Allow command",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: {
          type: "approval",
          requestId: "approval-1",
          messageId: "task-1-m-2",
        },
        payload: {
          toolName: "Bash",
          description: "Allow command",
        },
        dedupeKey: "task.approval_requested:turn-1:approval-1",
        createdAt: "2026-03-06T01:11:00.000Z",
      },
    });

    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.notification?.id).toBe("notification-task-complete");
    expect(approval.inserted).toBe(true);

    const allNotifications = store.listNotifications();
    expect(allNotifications.map((notification) => notification.id)).toEqual([
      "notification-approval",
      "notification-task-complete",
    ]);

    const markedApproval = store.markNotificationRead({
      id: "notification-approval",
      readAt: "2026-03-06T01:12:00.000Z",
    });
    expect(markedApproval?.readAt).toBe("2026-03-06T01:12:00.000Z");

    const unreadNotifications = store.listNotifications({ unreadOnly: true });
    expect(unreadNotifications.map((notification) => notification.id)).toEqual([
      "notification-task-complete",
    ]);

    const changedCount = store.markAllNotificationsRead({
      readAt: "2026-03-06T01:13:00.000Z",
    });
    expect(changedCount).toBe(1);
    expect(store.listNotifications({ unreadOnly: true })).toEqual([]);

    store.close();
  });

  nativeSqliteTest("stores and clears local MCP request logs", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.createLocalMcpRequestLog({
      log: {
        id: "local-mcp-log-1",
        httpMethod: "POST",
        path: "/mcp",
        rpcMethod: "tools/call",
        rpcRequestId: "rpc-1",
        toolName: "stave_run_task",
        statusCode: 200,
        durationMs: 42,
        requestPayload: {
          jsonrpc: "2.0",
          id: "rpc-1",
          method: "tools/call",
          params: {
            name: "stave_run_task",
            arguments: {
              workspaceId: "ws-1",
              prompt: "hello",
            },
          },
        },
        errorMessage: null,
        createdAt: "2026-03-06T02:00:00.000Z",
      },
    });
    store.createLocalMcpRequestLog({
      log: {
        id: "local-mcp-log-2",
        httpMethod: "POST",
        path: "/mcp",
        rpcMethod: null,
        rpcRequestId: null,
        toolName: null,
        statusCode: 401,
        durationMs: 3,
        requestPayload: null,
        errorMessage: "Unauthorized.",
        createdAt: "2026-03-06T02:00:01.000Z",
      },
    });

    const firstPage = store.listLocalMcpRequestLogs({ limit: 1, includePayload: false });

    expect(firstPage.logs.map((log) => log.id)).toEqual([
      "local-mcp-log-2",
    ]);
    expect(firstPage).toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      hasMore: true,
    });
    expect(firstPage.logs[0]).toMatchObject({
      id: "local-mcp-log-2",
      hasRequestPayload: false,
      requestPayload: null,
    });

    const secondPage = store.listLocalMcpRequestLogs({ limit: 1, offset: 1, includePayload: false });

    expect(secondPage.logs.map((log) => log.id)).toEqual([
      "local-mcp-log-1",
    ]);
    expect(secondPage).toMatchObject({
      total: 2,
      limit: 1,
      offset: 1,
      hasMore: false,
    });
    expect(secondPage.logs[0]).toMatchObject({
      id: "local-mcp-log-1",
      hasRequestPayload: true,
      requestPayload: null,
    });

    const clampedPage = store.listLocalMcpRequestLogs({ limit: 1, offset: 99, includePayload: false });

    expect(clampedPage).toMatchObject({
      total: 2,
      limit: 1,
      offset: 1,
      hasMore: false,
    });
    expect(clampedPage.logs[0]?.id).toBe("local-mcp-log-1");

    const log = store.getLocalMcpRequestLog({ id: "local-mcp-log-1", includePayload: true });

    expect(log).toMatchObject({
      id: "local-mcp-log-1",
      hasRequestPayload: true,
      toolName: "stave_run_task",
      rpcMethod: "tools/call",
      rpcRequestId: "rpc-1",
      statusCode: 200,
      durationMs: 42,
    });
    expect(log?.requestPayload).toEqual({
      jsonrpc: "2.0",
      id: "rpc-1",
      method: "tools/call",
      params: {
        name: "stave_run_task",
        arguments: {
          workspaceId: "ws-1",
          prompt: "hello",
        },
      },
    });

    expect(store.clearLocalMcpRequestLogs()).toBe(2);
    expect(store.listLocalMcpRequestLogs({ limit: 10, includePayload: false })).toEqual({
      logs: [],
      total: 0,
      limit: 10,
      offset: 0,
      hasMore: false,
    });

    store.close();
  });
});
