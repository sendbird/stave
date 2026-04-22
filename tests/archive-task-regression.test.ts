import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildWorkspaceSessionState,
  createWorkspaceSnapshot,
} from "@/store/workspace-session-state";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;
const ARCHIVED_TASK_TURN_NOTICE = "Generation stopped because the task was archived before this turn completed.";

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

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("archive task regression", () => {
  test("clears active turns and appends an archive notice when archiving a running task", async () => {
    const localStorage = createMemoryStorage();
    const abortCalls: string[] = [];
    const cleanupCalls: string[] = [];

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true, message: "cleaned" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [{
        id: "task-1",
        title: "Plan Task",
        provider: "codex",
        updatedAt: "2026-03-10T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      }],
      messagesByTask: {
        "task-1": [{
          id: "task-1-m-1",
          role: "assistant",
          model: "gpt-5.4",
          providerId: "codex",
          content: "1. Inspect\n2. Patch",
          isStreaming: true,
          isPlanResponse: true,
          planText: "1. Inspect\n2. Patch",
          parts: [{
            type: "text",
            text: "1. Inspect\n2. Patch",
          }],
        }],
      },
      activeTurnIdsByTask: {
        "task-1": "turn-1",
      },
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().archiveTask({ taskId: "task-1" });
    await Bun.sleep(0);

    const state = useAppStore.getState();
    const archivedTask = state.tasks.find((task) => task.id === "task-1");
    const archivedMessages = state.messagesByTask["task-1"] ?? [];
    const lastMessage = archivedMessages.at(-1);
    const previousAssistant = archivedMessages[0];

    expect(state.activeTaskId).toBe("");
    expect(state.activeTurnIdsByTask["task-1"]).toBeUndefined();
    expect(archivedTask?.archivedAt).toBeString();
    expect(previousAssistant?.isStreaming).toBe(false);
    expect(lastMessage).toMatchObject({
      role: "assistant",
      content: ARCHIVED_TASK_TURN_NOTICE,
    });
    expect(lastMessage?.parts.at(-1)).toEqual({
      type: "system_event",
      content: ARCHIVED_TASK_TURN_NOTICE,
    });
    expect(abortCalls).toEqual(["turn-1"]);
    expect(cleanupCalls).toEqual(["task-1"]);
  });

  test("ignores attempts to reselect an archived task", async () => {
    const localStorage = createMemoryStorage();

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      activeTaskId: "",
      tasks: [{
        id: "task-1",
        title: "Archived Task",
        provider: "codex",
        updatedAt: "2026-03-10T00:00:00.000Z",
        unread: false,
        archivedAt: "2026-03-10T00:10:00.000Z",
      }],
      activeSurface: { kind: "task", taskId: "" },
    });

    useAppStore.getState().selectTask({ taskId: "task-1" });

    const state = useAppStore.getState();
    expect(state.activeTaskId).toBe("");
    expect(state.activeSurface).toEqual({ kind: "task", taskId: "" });
  });

  test("normalizes archived active task selection out of restored workspace state", () => {
    const session = buildWorkspaceSessionState({
      snapshot: createWorkspaceSnapshot({
        activeTaskId: "task-archived",
        tasks: [{
          id: "task-archived",
          title: "Archived Task",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: "2026-03-10T00:10:00.000Z",
        }],
        messagesByTask: {
          "task-archived": [{
            id: "task-archived-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "persisted",
            isStreaming: false,
            parts: [{
              type: "text",
              text: "persisted",
            }],
          }],
        },
        promptDraftByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        terminalDocked: false,
        cliSessionTabs: [],
        activeCliSessionTabId: null,
        activeSurface: { kind: "task", taskId: "task-archived" },
        providerSessionByTask: {},
      }),
    });

    expect(session.activeTaskId).toBe("");
    expect(session.activeSurface).toEqual({ kind: "task", taskId: "" });
  });
});
