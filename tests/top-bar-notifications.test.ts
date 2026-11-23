import { describe, expect, test } from "bun:test";
import { getNextNotificationView } from "@/components/layout/top-bar-notifications.utils";

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
});
