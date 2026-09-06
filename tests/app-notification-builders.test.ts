import { describe, expect, mock, test } from "bun:test";
import { notificationToastManager } from "@/lib/notifications/toast";
import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  buildTaskTurnCompletedNotificationInput,
  buildTaskTurnFailedNotificationInput,
  showNotificationToast,
} from "@/store/app-notification-builders";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

function buildCompletedNotification(): AppNotification {
  return {
    id: "notification-completed",
    kind: "task.turn_completed",
    title: "Fix notification routing",
    body: "Latest run finished in fix/noti-click.",
    projectPath: "/tmp/stave",
    projectName: "stave",
    workspaceId: "workspace-notification-click",
    workspaceName: "fix/noti-click",
    taskId: "task-notification-click",
    taskTitle: "Fix notification routing",
    turnId: "turn-completed",
    providerId: "codex",
    action: null,
    payload: {
      stopReason: "end_turn",
    },
    createdAt: "2026-07-27T05:00:00.000Z",
    readAt: null,
  };
}

describe("showNotificationToast", () => {
  test("embeds the shared execution summary in completed notifications", () => {
    const session: WorkspaceSessionState = {
      activeTaskId: "task-summary",
      tasks: [
        {
          id: "task-summary",
          title: "Summarize work",
          provider: "codex",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-summary": [
          {
            id: "assistant-summary",
            role: "assistant",
            model: "gpt-5.6",
            providerId: "codex",
            content: "Updated the task.",
            usage: { inputTokens: 50, outputTokens: 10 },
            parts: [
              {
                type: "code_diff",
                filePath: "src/summary.ts",
                oldContent: "",
                newContent: "export const done = true;\n",
                status: "accepted",
              },
            ],
          },
        ],
      },
      messageCountByTask: { "task-summary": 1 },
      promptDraftByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: "task-summary" },
      openTaskTabIds: ["task-summary"],
      lensTabs: [],
      paneTabMeta: {},
      dockLayout: null,
      activeTurnIdsByTask: { "another-task": "still-running" },
      providerSessionByTask: {},
      providerGoalByTask: {},
      nativeSessionReadyByTask: {},
    };
    const input: Parameters<typeof buildTaskTurnCompletedNotificationInput>[0] = {
      state: {
        projectPath: "/tmp/stave",
        projectName: "stave",
        workspaces: [
          {
            id: "workspace-summary",
            name: "summary",
            updatedAt: "2026-07-31T00:00:00.000Z",
          },
        ],
        recentProjects: [],
      },
      session,
      workspaceId: "workspace-summary",
      taskId: "task-summary",
      turnId: "turn-summary",
      provider: "codex",
      events: [{ type: "done", stop_reason: "end_turn" }],
    };
    const notification = buildTaskTurnCompletedNotificationInput(input);

    expect(notification?.body).toContain("1 changed file");
    for (const reason of ["user_abort", "cancelled", "runtime_failure", "output_overflow"]) {
      const stopped = { ...input, events: [{ type: "done" as const, stop_reason: reason }] };
      expect(buildTaskTurnCompletedNotificationInput(stopped)).toBeNull();
      expect(Boolean(buildTaskTurnFailedNotificationInput(stopped))).toBe(
        reason === "runtime_failure" || reason === "output_overflow",
      );
    }
    expect(buildTaskTurnCompletedNotificationInput({
      ...input, session: { ...session, activeTurnIdsByTask: { "task-summary": "newer-turn" } },
    })).toBeNull();
    expect(notification?.payload.reviewArtifact).toMatchObject({
      facts: expect.arrayContaining([
        expect.stringContaining("1 changed file"),
        expect.stringContaining("60 tokens"),
      ]),
      cautions: expect.arrayContaining(["Verification was not reported."]),
    });
    expect(notification?.payload.executionSummaryProvenance).toMatchObject({
      changes: "derived",
      usage: "reported",
      verification: "unavailable",
      contextHeadroom: "unavailable",
    });
  });

  test("makes the completed notification toast open its task", () => {
    const onOpen = mock(() => {});
    const add = mock(notificationToastManager.add);
    const originalAdd = notificationToastManager.add;
    notificationToastManager.add = add;
    try {
      showNotificationToast(buildCompletedNotification(), { onOpen });
      const notice = add.mock.calls[0]?.[0];
      expect(notice?.type).toBe("success");
      expect(notice?.actionProps?.children).toBe("Open task");
      notice?.actionProps?.onClick?.({ defaultPrevented: false } as never);
    } finally {
      notificationToastManager.add = originalAdd;
    }
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
