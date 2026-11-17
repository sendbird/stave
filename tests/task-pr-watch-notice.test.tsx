import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskPullRequestWatchNoticeView } from "../src/components/session/TaskPullRequestWatchNotice";
import type { TaskWakeUp } from "../src/store/wake-ups-store";
import { i18n } from "../src/i18n";

function entry(state: "scheduled" | "paused" | "stopped", options: { kind?: "pull_request" | "completion"; automatic?: boolean; pr?: number | null } = {}) {
  const pullRequest = options.pr === null ? null : { number: options.pr ?? 17, url: "https://github.com/example/repo/pull/17", title: "Change" };
  return {
    wakeUp: { id: "watch-1", trigger: { kind: options.kind ?? "pull_request" }, pullRequestWatch: { pullRequest, ...(options.automatic === false ? {} : { automatic: true }) } },
    summary: { state },
  } as unknown as TaskWakeUp;
}
const render = (props: Partial<Parameters<typeof TaskPullRequestWatchNoticeView>[0]>) =>
  renderToStaticMarkup(createElement(TaskPullRequestWatchNoticeView, { onStop() {}, onOpenSchedules() {}, ...props }));

describe("task pull request watch record", () => {
  test("names the watched PR and offers Stop watching for an automatic watch in each locale", async () => {
    for (const [locale, watching, stop] of [["en", "Watching PR #17", "Stop watching"], ["ko", "PR #17의 검사 실패와 충돌을 감시하고 있습니다", "감시 중지"]]) {
      await i18n.changeLanguage(locale);
      const html = render({ entry: entry("scheduled") });
      expect(html).toContain(watching);
      expect(html).toContain(stop);
    }
    await i18n.changeLanguage("en");
  });
  test("a schedule the user made links to Schedules instead of deleting it", () => {
    const html = render({ entry: entry("scheduled", { automatic: false }) });
    expect(html).not.toContain("Stop watching");
    expect(html).toContain("Open in Schedules");
  });
  test("a watch without a PR yet does not claim to watch one", () => {
    const html = render({ entry: entry("scheduled", { pr: null }) });
    expect(html).not.toContain("Watching PR");
    expect(html).toContain("no pull request yet");
  });
  test("retains the stopped record without offering an ineffective action", () => {
    const html = render({ entry: entry("stopped") });
    expect(html).toContain("watching has stopped");
    expect(html).not.toContain("<button");
  });
  test("does not claim a different schedule watches a pull request", () => {
    expect(render({ entry: entry("scheduled", { kind: "completion" }) })).toBe("");
  });
  test("explains an ambiguous agent PR instead of watching it", () => {
    const html = render({ hint: { workspaceId: "ws", taskIds: ["a", "b"], pullRequest: { number: 17, url: "https://github.com/example/repo/pull/17" }, reason: "ambiguous-task" } });
    expect(html).toContain("PR #17");
    expect(html).toContain("more than one task");
    expect(html).toContain("Open in Schedules");
  });
});
