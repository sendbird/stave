import { describe, expect, test } from "bun:test";
import {
  getNextNotificationView,
  shouldShowNotificationApprovalActions,
} from "@/components/layout/top-bar-notifications.utils";

describe("top-bar-notifications utils", () => {
  test("resets the notification view to unread whenever the popover opens", () => {
    expect(getNextNotificationView({
      isOpening: true,
      previousView: "history",
    })).toBe("unread");

    expect(getNextNotificationView({
      isOpening: true,
      previousView: "unread",
    })).toBe("unread");
  });

  test("keeps the current tab selection when the popover closes", () => {
    expect(getNextNotificationView({
      isOpening: false,
      previousView: "history",
    })).toBe("history");
  });

  test("shows approval actions only for unread approval notifications", () => {
    expect(shouldShowNotificationApprovalActions({
      unread: true,
      action: {
        type: "approval",
        requestId: "approval-1",
      },
    })).toBe(true);

    expect(shouldShowNotificationApprovalActions({
      unread: false,
      action: {
        type: "approval",
        requestId: "approval-1",
      },
    })).toBe(false);

    expect(shouldShowNotificationApprovalActions({
      unread: true,
      action: null,
    })).toBe(false);
  });
});
