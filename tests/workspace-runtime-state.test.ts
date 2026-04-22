import { describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import { saveActiveWorkspaceRuntimeCache } from "@/store/workspace-runtime-state";

describe("saveActiveWorkspaceRuntimeCache", () => {
  test("retains Coliseum parent and branch messages while dropping unrelated idle tasks", () => {
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
        nativeSessionReadyByTask: {},
        activeColiseumsByTask: {
          "task-parent": {
            parentTaskId: "task-parent",
            runId: "run-1",
            branchTaskIds: ["branch-a"],
            branchMeta: {
              "branch-a": {
                branchTaskId: "branch-a",
                provider: "claude-code",
                model: "claude-sonnet-4-6",
              },
            },
            createdAt: "2026-04-20T12:00:00.000Z",
            parentMessageCountAtFanout: 1,
            status: "ready",
            championTaskId: null,
            pickedHistory: [],
            viewMode: "grid",
            focusedBranchTaskId: null,
            minimized: false,
            reviewerTaskId: "reviewer-1",
          },
        },
      },
    });

    expect(cache["ws-main"]?.messagesByTask).toEqual({
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
    });
  });
});
