import { afterEach, describe, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { useAppStore } from "@/store/app.store";
import { createTaskCoreActions } from "@/store/app-store-task-core-actions";
import { createEmptyWorkspaceState, type WorkspaceSessionState } from "@/store/workspace-session-state";
import type { AppState } from "@/store/app-store.types";
import type { Task } from "@/types/chat";

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => { (globalThis as { window?: unknown }).window = originalWindow; });

function setup(overrides: Partial<Task> = {}) {
  const task: Task = { id: "task-background", title: "New task", provider: "codex", updatedAt: "2026-10-01T00:00:00Z", unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave", ...overrides };
  const session = { ...createEmptyWorkspaceState(), tasks: [task], activeTaskId: task.id, activeTurnIdsByTask: {}, nativeSessionReadyByTask: {} };
  const store = createStore<AppState>(() => ({
    ...useAppStore.getInitialState(),
    activeWorkspaceId: "ws-active",
    tasks: [],
    taskWorkspaceIdById: { [task.id]: "ws-background" },
    workspaceRuntimeCacheById: { "ws-background": session },
  }));
  const writes: Array<{ workspaceId: string; session: WorkspaceSessionState }> = [];
  const actions = createTaskCoreActions({
    set: store.setState, get: store.getState,
    persistWorkspaceSessionInBackground: (args) => { writes.push(args); },
    runScriptHookInBackground: () => {}, attentionSync: {} as never,
    loadTaskMessagesIntoSession: async () => {},
    emptyPromptDraft: { text: "", attachedFilePaths: [], attachments: [] },
    incrementWorkspaceSnapshotVersion: (state) => state.workspaceSnapshotVersion + 1,
    incrementPromptDraftPersistenceVersion: (state) => state.promptDraftPersistenceVersion + 1,
    shouldLoadLatestTaskMessages: () => false,
    findTaskById: (state, taskId) => state.tasks.find((entry) => entry.id === taskId) ?? null,
  });
  return { task, store, actions, writes };
}

describe("task titles in the owning workspace", () => {
  test.each(["claude-code", "codex", "cursor", "kiro"] as const)("applies a delayed %s title after switching workspaces and schedules its save", (provider) => {
    const { task, store, actions, writes } = setup({ provider });
    actions.renameTask({ taskId: task.id, title: "Fix title persistence", source: "auto" });
    expect(store.getState().tasks).toEqual([]);
    expect(store.getState().workspaceRuntimeCacheById["ws-background"]?.tasks[0]?.title).toBe("Fix title persistence");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.workspaceId).toBe("ws-background");
    expect(writes[0]?.session.tasks[0]?.title).toBe("Fix title persistence");
  });

  test("keeps a manual title when notification focus refreshes an older persisted shell", async () => {
    const { task, store, actions } = setup({ title: "My chosen name", titleManuallySet: true });
    const session = store.getState().workspaceRuntimeCacheById["ws-background"]!;
    store.setState({ activeWorkspaceId: "ws-background", tasks: session.tasks, selectTask: () => {} });
    (globalThis as { window?: unknown }).window = { api: { persistence: {
      listWorkspaces: async () => ({ ok: true, workspaces: [] }),
      loadWorkspace: async () => ({ ok: true, workspace: null }),
      upsertWorkspace: async () => ({ ok: true }),
      loadWorkspaceShellForRestore: async () => ({ ok: true, shell: { ...session, tasks: [{ ...task, title: "New Task", titleManuallySet: undefined, unread: true }] } }),
    } } };
    await actions.focusTaskAttention({ taskId: task.id, refreshFromPersistence: true });
    expect(store.getState().tasks[0]).toMatchObject({ title: "My chosen name", titleManuallySet: true, unread: true });
  });

  test("keeps a background manual title when an automatic result arrives", () => {
    const { task, store, actions, writes } = setup({ title: "My chosen name", titleManuallySet: true });
    actions.renameTask({ taskId: task.id, title: "Automatic name", source: "auto" });
    expect(store.getState().workspaceRuntimeCacheById["ws-background"]?.tasks[0]?.title).toBe("My chosen name");
    expect(writes).toEqual([]);
  });

  test("does not rename a managed task or a task from an evicted workspace", () => {
    for (const evicted of [false, true]) {
      const { task, store, actions, writes } = setup({ controlMode: "managed", controlOwner: "external" });
      if (evicted) store.setState({ workspaceRuntimeCacheById: {} });
      const version = store.getState().workspaceSnapshotVersion;
      actions.renameTask({ taskId: task.id, title: "Late name", source: "auto" });
      expect(store.getState().workspaceSnapshotVersion).toBe(version);
      expect(writes).toEqual([]);
      expect(store.getState().tasks).toEqual([]);
    }
  });
});
