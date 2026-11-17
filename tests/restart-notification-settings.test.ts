import { describe, expect, test } from "bun:test";
import { defaultSettings } from "@/store/app-settings";
import en from "@/locales/en/settings.json";
import ko from "@/locales/ko/settings.json";

describe("restart and notification preferences", () => {
  test("new installs ask before recovery and enable supported native responses", () => {
    expect(defaultSettings.restartContinuation).toBe("ask");
    expect(defaultSettings.notificationActionsEnabled).toBe(true);
  });
  test("both locales expose every restart choice and native response setting", () => {
    for (const locale of [en, ko]) {
      expect(Object.keys(locale.desktopNotifications.restart)).toEqual(["title", "description", "ask", "automatically", "never"]);
      expect(locale.desktopNotifications.actions.title.length).toBeGreaterThan(0);
    }
  });
});
