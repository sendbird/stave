import { describe, expect, test } from "bun:test";
import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  buildNotificationToastOptions,
  buildNotificationDetail,
  NOTIFICATION_TOAST_DURATIONS_MS,
  formatApprovalNotificationDetail,
  formatNotificationStopReason,
} from "@/lib/notifications/notification.utils";

describe("notification formatting utils", () => {
  test("maps known stop reasons to readable labels", () => {
    expect(formatNotificationStopReason("end_turn")).toBe("Completed normally");
    expect(formatNotificationStopReason("max_tokens")).toBe(
      "Token limit reached",
    );
  });

  test("returns null for empty stop reasons and preserves unknown values", () => {
    expect(formatNotificationStopReason("  ")).toBeNull();
    expect(formatNotificationStopReason("custom_stop")).toBe("custom_stop");
  });

  test("builds approval detail from tool name and description", () => {
    expect(
      formatApprovalNotificationDetail({
        toolName: "Bash",
        description: "Run tests before continuing",
      }),
    ).toBe("Bash: Run tests before continuing");
  });

  test("falls back to the available approval field", () => {
    expect(
      formatApprovalNotificationDetail({
        toolName: "Bash",
        description: "   ",
      }),
    ).toBe("Bash");

    expect(
      formatApprovalNotificationDetail({
        description: "Run tests before continuing",
      }),
    ).toBe("Run tests before continuing");
  });

  test("returns null for completed notifications without a stop reason", () => {
    const notification = {
      kind: "task.turn_completed",
      payload: {
        stopReason: null,
      },
    } satisfies Pick<AppNotification, "kind" | "payload">;

    expect(buildNotificationDetail(notification)).toBeNull();
  });

  test("uses the same detail formatting for approval notifications", () => {
    const notification = {
      kind: "task.approval_requested",
      payload: {
        toolName: "Bash",
        description: "Run tests before continuing",
      },
    } satisfies Pick<AppNotification, "kind" | "payload">;

    expect(buildNotificationDetail(notification)).toBe(
      "Bash: Run tests before continuing",
    );
  });

  test("builds a faster dismissible success toast for completed turns", () => {
    const notification = {
      kind: "task.turn_completed",
      taskTitle: "Refactor notifications",
      workspaceName: "workspace",
      payload: {
        stopReason: "end_turn",
      },
    } satisfies Pick<
      AppNotification,
      "kind" | "taskTitle" | "workspaceName" | "payload"
    >;

    expect(buildNotificationToastOptions(notification)).toEqual({
      tone: "success",
      title: "Refactor notifications",
      description: "Completed normally",
      duration: NOTIFICATION_TOAST_DURATIONS_MS.turnCompleted,
      closeButton: true,
      dismissible: true,
    });
  });

  test("builds a dismissible approval toast with a finite duration", () => {
    const notification = {
      kind: "task.approval_requested",
      taskTitle: "Refactor notifications",
      workspaceName: "workspace",
      payload: {
        toolName: "Bash",
        description: "Run tests before continuing",
      },
    } satisfies Pick<
      AppNotification,
      "kind" | "taskTitle" | "workspaceName" | "payload"
    >;

    expect(buildNotificationToastOptions(notification)).toEqual({
      tone: "warning",
      title: "Approval needed — Refactor notifications",
      description: "Bash: Run tests before continuing",
      duration: NOTIFICATION_TOAST_DURATIONS_MS.approvalRequested,
      closeButton: true,
      dismissible: true,
    });
  });
});
