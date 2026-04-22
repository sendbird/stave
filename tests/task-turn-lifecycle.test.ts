import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { interruptWorkspaceTurnsBeforeTransition } from "@/store/task-turn-lifecycle";
import { WORKSPACE_SWITCH_TURN_NOTICE } from "@/store/workspace-session-state";
import type { ChatMessage, Task } from "@/types/chat";

const originalWindow = globalThis.window;

function createStreamingAssistantMessage(args: { taskId: string; provider: Task["provider"] }): ChatMessage {
  return {
    id: `${args.taskId}-m-1`,
    role: "assistant",
    model: args.provider === "claude-code" ? "claude-sonnet-4-6" : "gpt-5.4",
    providerId: args.provider,
    content: "",
    isStreaming: true,
    parts: [],
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("interruptWorkspaceTurnsBeforeTransition", () => {
  test("aborts every active turn by turn id even when multiple tasks share a provider", async () => {
    const abortCalls: string[] = [];
    const cleanupCalls: string[] = [];
    const appliedStates: Array<{
      messagesByTask: Record<string, ChatMessage[]>;
      activeTurnIdsByTask: Record<string, string | undefined>;
    }> = [];

    (globalThis as { window?: unknown }).window = {
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
        persistence: {
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    };

    const tasks: Task[] = [
      {
        id: "task-a",
        title: "Task A",
        provider: "codex",
        updatedAt: "2026-03-10T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
      {
        id: "task-b",
        title: "Task B",
        provider: "codex",
        updatedAt: "2026-03-10T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ];

    const interruptedTaskIds = await interruptWorkspaceTurnsBeforeTransition({
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-a",
      tasks,
      messagesByTask: {
        "task-a": [createStreamingAssistantMessage({ taskId: "task-a", provider: "codex" })],
        "task-b": [createStreamingAssistantMessage({ taskId: "task-b", provider: "codex" })],
      },
      promptDraftByTask: {},
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: "task-a" },
      activeTurnIdsByTask: {
        "task-a": "turn-a",
        "task-b": "turn-b",
      },
      providerSessionByTask: {},
      workspaceName: "Main",
      applyInterruptedState: (args) => {
        appliedStates.push(args);
      },
    });

    expect(interruptedTaskIds).toEqual(["task-a", "task-b"]);
    expect(abortCalls.sort()).toEqual(["turn-a", "turn-b"]);
    expect(cleanupCalls.sort()).toEqual(["task-a", "task-b"]);
    expect(appliedStates).toHaveLength(1);
    expect(appliedStates[0]?.activeTurnIdsByTask).toEqual({
      "task-a": undefined,
      "task-b": undefined,
    });
    expect(appliedStates[0]?.messagesByTask["task-a"]?.at(-1)?.content).toBe(WORKSPACE_SWITCH_TURN_NOTICE);
    expect(appliedStates[0]?.messagesByTask["task-b"]?.at(-1)?.content).toBe(WORKSPACE_SWITCH_TURN_NOTICE);
  });
});
