import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { interruptWorkspaceTurnsBeforeTransition } from "@/store/task-turn-lifecycle";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import {
  WORKSPACE_SWITCH_TURN_NOTICE,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import {
  MAX_LOADED_TASK_MESSAGES,
  MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK,
} from "@/store/task-message-loading";
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
          listWorkspaces: async () => ({ ok: true, workspaces: [] }),
          loadWorkspace: async () => ({ ok: true, workspace: null }),
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

describe("applyProviderEventsToWorkspaceSession — resident window eviction", () => {
  function buildResidentSession(
    taskId: string,
    count: number,
  ): WorkspaceSessionState {
    const messages: ChatMessage[] = Array.from({ length: count }, (_, index) => ({
      // Last message is a user turn so replay appends a fresh assistant message.
      id: `${taskId}-m-${index + 1}`,
      role: index === count - 1 ? "user" : "assistant",
      model: index === count - 1 ? "user" : "gpt-5.4",
      providerId: index === count - 1 ? "user" : "codex",
      content: `message ${index + 1}`,
      parts: [],
    }));
    return {
      messagesByTask: { [taskId]: messages },
      messageCountByTask: { [taskId]: count },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      providerGoalByTask: {},
    } as unknown as WorkspaceSessionState;
  }

  test("caps the resident window while preserving the full durable count", () => {
    const taskId = "task-evict";
    // Sit exactly at the hysteresis ceiling; one streamed message tips it over.
    const residentCount =
      MAX_LOADED_TASK_MESSAGES + MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK;
    const session = buildResidentSession(taskId, residentCount);

    const result = applyProviderEventsToWorkspaceSession({
      session,
      taskId,
      events: [{ type: "text", text: "fresh streamed token" }],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    const resident = result.session.messagesByTask[taskId] ?? [];
    // Window trimmed back to the cap...
    expect(resident).toHaveLength(MAX_LOADED_TASK_MESSAGES);
    // ...but the in-flight streaming message is never evicted...
    expect(resident.at(-1)?.id).toBe(`${taskId}-m-${residentCount + 1}`);
    expect(resident.at(-1)?.isStreaming).toBe(true);
    // ...and the durable count stays untrimmed so "load older" remains enabled.
    expect(result.session.messageCountByTask[taskId]).toBe(residentCount + 1);
    expect(result.session.messageCountByTask[taskId]).toBeGreaterThan(
      resident.length,
    );
  });
});
