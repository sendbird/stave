import { describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import { saveActiveWorkspaceRuntimeCache } from "@/store/workspace-runtime-state";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";

describe("saveActiveWorkspaceRuntimeCache", () => {
  test("retains active task messages while dropping idle task messages", () => {
    const cache = saveActiveWorkspaceRuntimeCache({
      state: {
        activeWorkspaceId: "ws-main",
        workspaceRuntimeCacheById: {},
        layout: { terminalDocked: false },
        activeTaskId: "task-other",
        tasks: [
          {
            id: "task-parent",
            title: "Parent",
            provider: "claude-code",
            updatedAt: "2026-04-20T12:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
          {
            id: "task-other",
            title: "Other",
            provider: "claude-code",
            updatedAt: "2026-04-20T12:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
        ],
        messagesByTask: {
          "task-parent": [
            {
              id: "task-parent-m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "compare these",
              parts: [{ type: "text", text: "compare these" }],
            },
          ],
          "branch-a": [
            {
              id: "branch-a-m-1",
              role: "assistant",
              model: "claude-sonnet-4-6",
              providerId: "claude-code",
              content: "final branch answer",
              parts: [{ type: "text", text: "final branch answer" }],
            },
          ],
          "reviewer-1": [
            {
              id: "reviewer-1-m-1",
              role: "assistant",
              model: "claude-opus",
              providerId: "claude-code",
              content: "pick branch a",
              parts: [{ type: "text", text: "pick branch a" }],
            },
          ],
          "task-other": [
            {
              id: "task-other-m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "keep me",
              parts: [{ type: "text", text: "keep me" }],
            },
          ],
          "idle-task": [
            {
              id: "idle-task-m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "drop me",
              parts: [{ type: "text", text: "drop me" }],
            },
          ],
        },
        messageCountByTask: {
          "task-parent": 1,
          "branch-a": 1,
          "reviewer-1": 1,
          "task-other": 1,
          "idle-task": 1,
        },
        promptDraftByTask: {},
        workspaceInformation: createEmptyWorkspaceInformation(),
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        cliSessionTabs: [],
        activeCliSessionTabId: null,
        activeSurface: { kind: "task", taskId: "task-other" },
        activeTurnIdsByTask: {},
        providerSessionByTask: {},
        providerGoalByTask: {},
        nativeSessionReadyByTask: {},
      },
    });

    expect(cache["ws-main"]?.messagesByTask).toEqual({
      "task-other": [
        {
          id: "task-other-m-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "keep me",
          parts: [{ type: "text", text: "keep me" }],
        },
      ],
    });
  });
});

describe("applyProviderEventsToWorkspaceSession", () => {
  test("marks snapshots changed when only the provider goal changes", () => {
    const session = {
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Goal Task",
          provider: "codex",
          updatedAt: "2026-04-20T12:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-1": [] },
      messageCountByTask: { "task-1": 0 },
      promptDraftByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: "task-1" },
      activeTurnIdsByTask: { "task-1": "turn-1" },
      providerSessionByTask: { "task-1": { codex: "thread-1" } },
      providerGoalByTask: {},
      nativeSessionReadyByTask: { "task-1": true },
    };

    const applied = applyProviderEventsToWorkspaceSession({
      session,
      taskId: "task-1",
      events: [
        {
          type: "goal_status",
          providerId: "codex",
          goal: {
            providerId: "codex",
            nativeSessionId: "thread-1",
            objective: "Fix the stalled goal turn",
            status: "active",
            tokenBudget: null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 0,
            updatedAt: 1,
          },
        },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(applied.stateChanged).toBe(true);
    expect(applied.snapshotChanged).toBe(true);
    expect(applied.session.providerGoalByTask["task-1"]?.objective).toBe(
      "Fix the stalled goal turn",
    );
  });
});
