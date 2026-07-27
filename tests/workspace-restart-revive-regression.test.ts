import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import { buildWorkspaceSessionState } from "@/store/workspace-session-state";
import type { Task } from "../src/types/chat";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

type PersistedTask = { id: string; archivedAt?: string | null };
type UpsertCall = {
  id: string;
  snapshot: { tasks: PersistedTask[] };
};

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function createShell(args: { taskId: string; archivedAt?: string | null }) {
  return {
    activeTaskId: args.taskId,
    tasks: [
      {
        id: args.taskId,
        title: args.taskId,
        provider: "codex" as const,
        updatedAt: "2026-03-31T00:00:00.000Z",
        unread: false,
        archivedAt: args.archivedAt ?? null,
      },
    ],
    promptDraftByTask: {},
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
    terminalTabs: [],
    activeTerminalTabId: null,
    terminalDocked: false,
    cliSessionTabs: [],
    activeCliSessionTabId: null,
    activeSurface: { kind: "task" as const, taskId: args.taskId },
    workspaceInformation: createEmptyWorkspaceInformation(),
    messageCountByTask: { [args.taskId]: 0 },
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("workspace switch archive persistence", () => {
  test("archiving a task and immediately switching workspaces still persists the archive", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: UpsertCall[] = [];
    const syncUpsertCalls: UpsertCall[] = [];

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
        provider: {
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShellLite: async () => ({ ok: true, shell: null }),
          upsertWorkspace: async (call: UpsertCall) => {
            upsertCalls.push(call);
            return { ok: true };
          },
          upsertWorkspaceSync: (call: UpsertCall) => {
            syncUpsertCalls.push(call);
            return { ok: true };
          },
          loadWorkspaceShellForRestore: async () => ({
            ok: true,
            shell: createShell({ taskId: "task-other" }),
          }),
          listActiveWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
        {
          id: "ws-other",
          name: "other",
          updatedAt: "2026-03-31T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      activeSurface: { kind: "task", taskId: "task-1" },
      openTaskTabIds: ["task-1"],
      tasks: [
        {
          id: "task-1",
          title: "Archived Me",
          provider: "codex",
          updatedAt: "2026-03-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      taskWorkspaceIdById: { "task-1": "ws-main" },
      workspacePathById: {
        "ws-main": "/tmp/project-a",
        "ws-other": "/tmp/project-a/.stave/workspaces/other",
      },
      workspaceBranchById: { "ws-main": "main", "ws-other": "other" },
      workspaceDefaultById: { "ws-main": true, "ws-other": false },
    });

    useAppStore.getState().archiveTask({ taskId: "task-1" });
    expect(
      useAppStore.getState().tasks.find((task) => task.id === "task-1")
        ?.archivedAt,
    ).toBeTruthy();

    // The user switches away before any debounced snapshot flush has run.
    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-other" });

    const writesForMain = [...upsertCalls, ...syncUpsertCalls].filter(
      (call) => call.id === "ws-main",
    );
    const archivedWrite = writesForMain.find((call) =>
      call.snapshot.tasks.some(
        (task) => task.id === "task-1" && Boolean(task.archivedAt),
      ),
    );

    expect(archivedWrite).toBeDefined();
  });
});

describe("closed task tabs survive a reload", () => {
  function createLiveTask(id: string): Task {
    return {
      id,
      title: id,
      provider: "codex",
      updatedAt: "2026-03-31T00:00:00.000Z",
      unread: false,
      archivedAt: null,
    };
  }

  test("an explicitly empty tab set does not reopen a closed task", () => {
    const built = buildWorkspaceSessionState({
      snapshot: {
        ...createShell({ taskId: "task-1" }),
        tasks: [createLiveTask("task-1"), createLiveTask("task-2")],
        activeTaskId: "",
        openTaskTabIds: [],
        activeSurface: { kind: "task", taskId: "" },
        messagesByTask: {},
        lensTabs: [],
        paneTabMeta: {},
        dockLayout: null,
      },
    });

    expect(built.openTaskTabIds).toEqual([]);
    expect(built.activeTaskId).toBe("");
    expect(built.activeSurface).toEqual({ kind: "task", taskId: "" });
  });

  test("a stale activeTaskId cannot reopen a tab the user closed", () => {
    const built = buildWorkspaceSessionState({
      snapshot: {
        ...createShell({ taskId: "task-1" }),
        tasks: [createLiveTask("task-1"), createLiveTask("task-2")],
        activeTaskId: "task-1",
        openTaskTabIds: [],
        activeSurface: { kind: "task", taskId: "" },
        messagesByTask: {},
        lensTabs: [],
        paneTabMeta: {},
        dockLayout: null,
      },
    });

    expect(built.openTaskTabIds).toEqual([]);
    expect(built.activeTaskId).toBe("");
  });

  test("legacy snapshots without openTaskTabIds still open every live task", () => {
    const shell = createShell({ taskId: "task-1" });
    const built = buildWorkspaceSessionState({
      snapshot: {
        ...shell,
        tasks: [createLiveTask("task-1"), createLiveTask("task-2")],
        activeTaskId: "task-1",
        messagesByTask: {},
        lensTabs: [],
        paneTabMeta: {},
        dockLayout: null,
      },
    });

    expect(built.openTaskTabIds).toEqual(["task-1", "task-2"]);
    expect(built.activeTaskId).toBe("task-1");
  });
});
