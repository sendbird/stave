import { describe, expect, mock, test } from "bun:test";
import { isValidElement } from "react";
import { toast } from "sonner";
import type { AppNotification } from "@/lib/notifications/notification.types";
import { showNotificationToast } from "@/store/app-notification-builders";

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
  test("makes the completed notification toast open its task", () => {
    const onOpen = mock(() => {});
    const toastId = showNotificationToast(buildCompletedNotification(), {
      onOpen,
    });
    const renderedToast = toast
      .getToasts()
      .find((candidate) => candidate.id === toastId);
    const action =
      renderedToast?.action && !isValidElement(renderedToast.action)
        ? renderedToast.action
        : null;

    expect(action).toBeTruthy();
    expect(renderedToast?.actionButtonStyle).toMatchObject({
      position: "absolute",
      inset: 0,
      height: "auto",
      margin: 0,
      padding: 0,
      background: "transparent",
    });

    action?.onClick({} as never);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
