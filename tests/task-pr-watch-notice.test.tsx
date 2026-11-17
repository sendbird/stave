import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskPullRequestWatchNoticeView } from "../src/components/session/TaskPullRequestWatchNotice";
import type { TaskWakeUp } from "../src/store/wake-ups-store";
import { i18n } from "../src/i18n";

function entry(state: "scheduled" | "paused" | "stopped", kind: "pull_request" | "completion" = "pull_request") {
  return { wakeUp: { id: "watch-1", trigger: { kind } }, summary: { state } } as TaskWakeUp;
}

describe("task pull request watch record", () => {
  test("shows the watch and a stop action in each supported locale", async () => {
    for (const [locale, watching, stop] of [["en", "now being watched", "Stop watching"], ["ko", "감시하고 있습니다", "감시 중지"]]) {
      await i18n.changeLanguage(locale);
      const html = renderToStaticMarkup(createElement(TaskPullRequestWatchNoticeView, { entry: entry("scheduled"), onStop() {} }));
      expect(html).toContain(watching);
      expect(html).toContain(stop);
    }
    await i18n.changeLanguage("en");
  });
  test("retains the stopped record without offering an ineffective action", () => {
    const html = renderToStaticMarkup(createElement(TaskPullRequestWatchNoticeView, { entry: entry("stopped"), onStop() {} }));
    expect(html).toContain("watching has stopped");
    expect(html).not.toContain("<button");
  });
  test("does not claim a different schedule watches a pull request", () => {
    expect(renderToStaticMarkup(createElement(TaskPullRequestWatchNoticeView, { entry: entry("scheduled", "completion"), onStop() {} }))).toBe("");
  });
});
