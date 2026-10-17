import { describe, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { useAppStore } from "@/store/app.store";
import { createTaskCoreActions } from "@/store/app-store-task-core-actions";
import type { AppState } from "@/store/app-store.types";
import { MAX_LOADED_TASK_MESSAGES } from "@/store/task-message-loading";
import type { ChatMessage, Task } from "@/types/chat";

const TOTAL_MESSAGES = MAX_LOADED_TASK_MESSAGES * 2;

function setup(args: { flush: (state: AppState) => Promise<void> }) {
  const task: Task = { id: "task-source", title: "Long task", provider: "codex", updatedAt: "2026-10-01T00:00:00Z", unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" };
  const messages: ChatMessage[] = Array.from({ length: TOTAL_MESSAGES }, (_, index) => ({
    id: `message-${index}`, role: index % 2 === 0 ? "user" : "assistant", model: "gpt", providerId: "codex", content: `Message ${index}`, parts: [],
  }));
  const store = createStore<AppState>(() => ({
    ...useAppStore.getInitialState(),
    hasHydratedWorkspaces: true,
    activeWorkspaceId: "ws-active",
    workspaces: [{ id: "ws-active", name: "Active", updatedAt: "2026-10-01T00:00:00Z" }],
    tasks: [task],
    activeTaskId: task.id,
    messagesByTask: { [task.id]: messages },
    messageCountByTask: { [task.id]: messages.length },
    taskWorkspaceIdById: { [task.id]: "ws-active" },
    flushActiveWorkspaceSnapshot: () => args.flush(store.getState()),
  }));
  const actions = createTaskCoreActions({
    set: store.setState, get: store.getState,
    persistWorkspaceSessionInBackground: () => {},
    runScriptHookInBackground: () => {}, attentionSync: {} as never,
    loadTaskMessagesIntoSession: async () => {},
    emptyPromptDraft: { text: "", attachedFilePaths: [], attachments: [] },
    incrementWorkspaceSnapshotVersion: (state) => state.workspaceSnapshotVersion + 1,
    incrementPromptDraftPersistenceVersion: (state) => state.promptDraftPersistenceVersion + 1,
    shouldLoadLatestTaskMessages: () => false,
    findTaskById: (state, taskId) => state.tasks.find((entry) => entry.id === taskId) ?? null,
  });
  return { task, store, actions };
}

describe("duplicateTask resident messages", () => {
  test("writes the full copy, then keeps only the trimmed window resident", async () => {
    const written: number[] = [];
    const { task, store, actions } = setup({
      flush: async (state) => {
        written.push(state.messagesByTask[state.activeTaskId]?.length ?? 0);
      },
    });
    await actions.duplicateTask({ taskId: task.id });
    const state = store.getState();
    const duplicateId = state.activeTaskId;
    expect(duplicateId).not.toBe(task.id);
    expect(written).toEqual([TOTAL_MESSAGES]);
    expect(state.messagesByTask[duplicateId]).toHaveLength(MAX_LOADED_TASK_MESSAGES);
    expect(state.messagesByTask[duplicateId]?.at(-1)?.content).toBe(`Message ${TOTAL_MESSAGES - 1}`);
    expect(state.messageCountByTask[duplicateId]).toBe(TOTAL_MESSAGES);
  });

  test("keeps the full copy resident when the write fails", async () => {
    const { task, store, actions } = setup({
      flush: async () => {
        throw new Error("disk full");
      },
    });
    await actions.duplicateTask({ taskId: task.id });
    const state = store.getState();
    expect(state.messagesByTask[state.activeTaskId]).toHaveLength(TOTAL_MESSAGES);
  });
});
