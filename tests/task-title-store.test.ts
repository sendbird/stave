import { afterEach, describe, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { useAppStore } from "@/store/app.store";
import { selectTaskHistoryEntries } from "../src/lib/tasks";
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

test("task pinning persists background workspace preferences without activating it", () => {
  const { task, store, actions, writes } = setup();
  actions.pinTask({ taskId: task.id, workspaceId: "ws-background", pinned: true });
  expect(store.getState().activeWorkspaceId).toBe("ws-active");
  expect(store.getState().tasks).toEqual([]);
  expect(store.getState().workspaceRuntimeCacheById["ws-background"]?.tasks[0]?.pinned).toBe(true);
  expect(writes[0]?.session.tasks[0]?.pinned).toBe(true);
});

test("active task pinning preserves task activity and increments the snapshot version", () => {
  const { task, store, actions } = setup();
  store.setState({ tasks: [task], workspaceSnapshotVersion: 10 });
  actions.pinTask({ taskId: task.id, pinned: true });
  expect(store.getState().tasks[0]?.pinned).toBe(true);
  expect(store.getState().tasks[0]?.updatedAt).toBe(task.updatedAt);
  expect(store.getState().workspaceSnapshotVersion).toBe(11);
});

test("notification focus refresh keeps a pin and history order made inside the save debounce", async () => {
  const { task, store, actions } = setup({ pinned: true, historyOrderKey: 42 });
  const session = store.getState().workspaceRuntimeCacheById["ws-background"]!;
  store.setState({ activeWorkspaceId: "ws-background", tasks: session.tasks, selectTask: () => {} });
  (globalThis as { window?: unknown }).window = { api: { persistence: {
    listWorkspaces: async () => ({ ok: true, workspaces: [] }),
    loadWorkspace: async () => ({ ok: true, workspace: null }),
    upsertWorkspace: async () => ({ ok: true }),
    loadWorkspaceShellForRestore: async () => ({ ok: true, shell: { ...session, tasks: [{ ...task, pinned: undefined, historyOrderKey: undefined, unread: true }] } }),
  } } };
  await actions.focusTaskAttention({ taskId: task.id, refreshFromPersistence: true });
  expect(store.getState().tasks[0]).toMatchObject({ pinned: true, historyOrderKey: 42, unread: true });
});

test("history reorder and reset in a background workspace never activate it", () => {
  const { store, actions, writes } = setup();
  const tasks = [
    { id: "a", updatedAt: "2026-10-01T00:00:00Z" }, { id: "b", updatedAt: "2026-10-02T00:00:00Z" }, { id: "c", updatedAt: "2026-10-03T00:00:00Z" },
  ].map(item => ({ title: item.id, provider: "codex" as const, unread: false, archivedAt: null, controlMode: "interactive" as const, controlOwner: "stave" as const, ...item }));
  const session = store.getState().workspaceRuntimeCacheById["ws-background"]!;
  store.setState({ workspaceRuntimeCacheById: { "ws-background": { ...session, tasks, openTaskTabIds: [] } } });
  actions.reorderTaskHistory({ workspaceId: "ws-background", activeTaskId: "a", overTaskId: "c", visibleTaskIds: ["c", "b", "a"] });
  expect(store.getState().activeWorkspaceId).toBe("ws-active");
  const reordered = store.getState().workspaceRuntimeCacheById["ws-background"]!.tasks;
  expect(selectTaskHistoryEntries({ tasks: reordered, openTaskTabIds: [] }).map(item => item.id)).toEqual(["a", "c", "b"]);
  expect(writes.at(-1)?.session.tasks.find(item => item.id === "a")?.historyOrderKey).toBeNumber();
  actions.resetTaskHistoryOrder({ workspaceId: "ws-background" });
  const reset = store.getState().workspaceRuntimeCacheById["ws-background"]!.tasks;
  expect(reset.some(item => item.historyOrderKey !== undefined)).toBe(false);
  expect(selectTaskHistoryEntries({ tasks: reset, openTaskTabIds: [] }).map(item => item.id)).toEqual(["c", "b", "a"]);
  expect(store.getState().activeWorkspaceId).toBe("ws-active");
});

test("a duplicated task starts unpinned and in activity order", async () => {
  const { task, store, actions } = setup({ pinned: true, historyOrderKey: 42 });
  const session = store.getState().workspaceRuntimeCacheById["ws-background"]!;
  store.setState({ activeWorkspaceId: "ws-background", tasks: session.tasks, openTaskTabIds: [task.id], messagesByTask: { [task.id]: [] } });
  await actions.duplicateTask({ taskId: task.id });
  const copy = store.getState().tasks.find(item => item.id !== task.id)!;
  expect(copy).toBeDefined();
  expect(copy.pinned).toBeUndefined();
  expect(copy.historyOrderKey).toBeUndefined();
});
