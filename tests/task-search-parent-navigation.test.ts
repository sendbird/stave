import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { useAppStore } from "@/store/app.store";
import { createTaskCoreActions } from "@/store/app-store-task-core-actions";
import type { AppState } from "@/store/app-store.types";
import type { Task } from "@/types/chat";

test("search opens an archived parent without restoring it or changing ordinary selection", async () => {
  const archivedAt = "2026-11-01T00:00:00.000Z";
  const parent: Task = { id: "archived-parent", title: "Parent", provider: "codex", updatedAt: archivedAt, unread: false, archivedAt };
  const store = createStore<AppState>(() => ({ ...useAppStore.getInitialState(),
    activeTaskId: "child", activeWorkspaceId: "workspace", workspaces: [{ id: "workspace", name: "Main" }],
    tasks: [parent], taskWorkspaceIdById: { [parent.id]: "workspace" },
  }));
  const loads: unknown[] = [];
  const attention: string[] = [];
  const actions = createTaskCoreActions({ set: store.setState, get: store.getState,
    persistWorkspaceSessionInBackground: () => {}, runScriptHookInBackground: () => {},
    attentionSync: { markTaskNotificationsRead: () => {attention.push("read");}, syncTaskInteractions: () => {attention.push("sync");} } as never,
    loadTaskMessagesIntoSession: async (args) => { loads.push(args); return "loaded"; },
    emptyPromptDraft: { text: "", attachedFilePaths: [], attachments: [] },
    incrementWorkspaceSnapshotVersion: (state) => state.workspaceSnapshotVersion + 1,
    incrementPromptDraftPersistenceVersion: (state) => state.promptDraftPersistenceVersion + 1,
    shouldLoadLatestTaskMessages: () => true,
  });
  store.setState(actions);
  await actions.focusTaskAttention({ taskId: parent.id, workspaceId: "workspace" });
  expect(store.getState().activeTaskId).toBe("child");
  await actions.focusTaskAttention({ taskId: parent.id, workspaceId: "workspace", searchQuery: "retry" });
  expect(store.getState().activeTaskId).toBe(parent.id);
  expect(attention).toEqual(["read", "sync"]);
  expect(store.getState().activeSurface).toEqual({ kind: "task", taskId: parent.id });
  expect(store.getState().tasks[0]?.archivedAt).toBe(archivedAt);
  expect(loads).toEqual([{ taskId: parent.id, workspaceId: "workspace", mode: "latest" }]);
});
