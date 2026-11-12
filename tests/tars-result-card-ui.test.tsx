import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import type { TarsActivityNotice } from "../src/lib/tars/flow-model";
import type { TarsActivity, TarsResponsibility } from "../src/lib/tars/types";
import { buildTarsResultFixtures } from "../src/dev/tars-preview/tars-result-fixtures";
import { TarsActivityNoticeLine } from "../src/components/tars/TarsFlowBlock";
import { TarsConversationError } from "../src/components/tars/TarsMessageChrome";
import { TarsRecordDetail, TarsRecordSub } from "../src/components/tars/TarsRecord";
import { readFileSync } from "node:fs";
import { TarsResultProvider } from "../src/components/tars/TarsResultCard";
import type { TarsTrayActions } from "../src/components/tars/TarsTray";

const START = new Date("2026-11-05T00:00:00.000Z");
const fixtures = buildTarsResultFixtures(START);
const rowOf = (key: keyof typeof fixtures.ids) => fixtures.responsibilities.find((row) => row.id === fixtures.ids[key])!;
const activityOf = (row: TarsResponsibility, patch: Partial<TarsActivity> = {}): TarsActivity => ({ id: `activity-${row.id}`, responsibilityId: row.id, revision: row.revision,
  title: row.title, state: row.state, detail: row.detail, detailCode: row.detailCode, detailParams: row.detailParams, createdAt: START.toISOString(), ...patch });
const noticeOf = (row: TarsResponsibility, patch: Partial<TarsActivity> = {}): TarsActivityNotice =>
  ({ activity: activityOf(row, patch), kind: row.state === "completed" ? "completed" : row.state === "cancelled" ? "cancelled" : "blocked" });
const actions: TarsTrayActions = { busy: false, onAct: () => undefined, onConfirm: () => undefined, onOpenTask: () => undefined, onShowInFleet: () => undefined,
  onOpenSide: () => undefined, onPublish: () => undefined };

/** The notice as the Tars view draws it: inside the provider that holds the work, its runs and the tray's handlers. */
function render(notice: TarsActivityNotice, options: { responsibilities?: TarsResponsibility[]; activity?: TarsActivity[]; actions?: TarsTrayActions } = {}) {
  return renderToStaticMarkup(createElement(TarsResultProvider, { responsibilities: options.responsibilities ?? fixtures.responsibilities, runs: fixtures.runs,
    activity: options.activity ?? [notice.activity], records: [], actions: options.actions ?? actions, agentNameOf: (id) => id === "implementer" ? "Implementer" : undefined,
    children: createElement(TarsActivityNoticeLine, { notice }) }));
}
const criteria = (html: string) => [...html.matchAll(/data-tars-result-criterion="([^"]+)"/g)].map((match) => match[1]);

describe("Tars result card", () => {
  test("headlines and record descriptions use single-line ellipsis and keep complete text", () => {
    for (const file of ['tars-completion.styles.ts', 'tars-record.styles.ts', 'tars-activity.styles.ts']) {
      const source = readFileSync(new URL(`../src/components/tars/${file}`, import.meta.url), 'utf8');
      expect(source).toContain('whiteSpace: "nowrap"');
      expect(source).toContain('textOverflow: "ellipsis"');
    }
    // A failure notice says what to do next, so it wraps inside the column instead of cutting words.
    const message = readFileSync(new URL('../src/components/tars/tars-message.styles.ts', import.meta.url), 'utf8');
    expect(message).toContain('noticeText: { margin: 0, minWidth: 0, overflowWrap: "anywhere" }');
    const text = 'Blocked while checking exports.\n' + 'bun test tests/export.test.ts '.repeat(20);
    for (const Component of [TarsRecordDetail, TarsRecordSub]) {
      const html = renderToStaticMarkup(createElement(Component, { state: "halted", children: text }));
      expect(html).toContain(`title="${text}"`);
      expect(html).toContain(text);
    }
  });

  test("long failure notices preserve the original error on hover", () => {
    const error = 'Export failed.\n' + 'bun test tests/export.test.ts '.repeat(20);
    const html = renderToStaticMarkup(createElement(TarsConversationError, { error, send: true, onRetry: () => undefined }));
    expect(html).toContain(`title="${error}"`);
    expect(html).toContain(error);
  });

  test("full stage summaries and criteria follow the disclosure, while limitations stay visible", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("verified")));
    const disclosure = html.indexOf('data-tars-result-details');
    for (const marker of ['data-tars-full-summary', 'data-tars-result-criterion', 'data-tars-completion-count', 'data-tars-evidence-group']) {
      expect(html.indexOf(marker)).toBeGreaterThan(disclosure);
    }
    expect(html.indexOf('data-tars-completion-summary')).toBeLessThan(disclosure);
    for (const key of ["stalled", "reported"] as const) {
      const result = render(noticeOf(rowOf(key)));
      const warnings = result.indexOf('data-tars-completion-warnings');
      expect(warnings).toBeGreaterThan(0);
      expect(warnings).toBeLessThan(result.indexOf('data-tars-result-details'));
    }
  });
  test("completed and verified: each criterion says what confirmed it, then the summary, changes, review and views", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("verified")));
    expect(html).toContain('data-tars-result="completed"');
    expect(html).toContain('data-tars-activity="completed"');
    expect(html).toContain(">Completed<");
    expect(html).toContain("Implementer · 40m");
    expect(html).toContain('aria-label="Result of Export invoices as CSV"');
    expect(criteria(html)).toEqual(["verifiedReview", "verifiedCheck"]);
    expect(html).toContain(">Reviewed<");
    expect(html).toContain("2/2 confirmed");
    expect(html).toContain("Evidence &amp; review");
    expect(html).toContain(">Check passed<");
    // Stage-wide checks are disclosed on demand rather than repeated beside every criterion.
    expect(html).not.toContain("Passed checks run by Stave: test");
    expect(html).toContain("Added the CSV export with a header row");
    expect(html).toContain("3 files changed");
    expect(html).toContain(">+42<");
    expect(html).toContain(">−7<");
    expect(html).toContain("Review passed");
    expect(html).toContain('aria-label="Open report for Export invoices as CSV"');
    expect(html).toContain('aria-label="View changes for Export invoices as CSV"');
    // Completed work has no next steps and no timeline button.
    expect(html).not.toContain("data-tars-next-steps");
    expect(html).not.toContain('data-tars-result-open="timeline"');
  });

  test("completed on the agent's report alone never reads as verified", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("reported")));
    expect(criteria(html)).toEqual(["reported", "reported"]);
    expect(html.match(/>Reported</g)).toHaveLength(2);
    expect(html).toContain("2/2 reported met");
    expect(html).not.toContain("2/2 confirmed");
    expect(html).not.toContain("confirmed by");
    expect(html).not.toContain("data-tars-result-stave-checks");
    expect(html).not.toContain("data-tars-result-review");
    await applyAppLocale("ko");
    try {
      const ko = render(noticeOf(rowOf("reported")));
      expect(ko.match(/>보고됨</g)).toHaveLength(2);
      expect(ko).toContain("2/2 충족 보고");
      expect(ko).not.toContain("검사로 확인");
      expect(ko).not.toContain("리뷰로 확인");
      expect(render(noticeOf(rowOf("verified")))).toContain("리뷰 확인");
    } finally { await applyAppLocale("en"); }
  });

  test("completed with a draft PR links it", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("published")));
    expect(html).toContain('data-tars-publish-entry="opened"');
    expect(html).toContain('href="https://github.com/example/web/pull/57"');
    expect(html).toContain("Draft PR #57 open");
    expect(criteria(html)).toEqual(["verifiedReview"]);
  });

  test("blocked: the reason in plain words, the run's own words folded, the report's statuses and the state's next steps", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("stalled")));
    expect(html).toContain('data-tars-result="blocked"');
    expect(html).toContain(">Blocked<");
    expect(html).toContain("Stopped with some completion criteria unmet. Open the report to see what is missing.");
    // Folded: the run's own words are behind the disclosure, not in the card's first read (the e2e opens it).
    expect(html).toContain('data-tars-diagnostic=""');
    expect(html).not.toContain("The load test kept p95 at 840 ms");
    expect(criteria(html)).toEqual(["unmet", "reported"]);
    expect(html).toContain(">Not met<");
    expect(html).toContain('data-tars-next-steps="result-stalled"');
    for (const operation of ["resume", "takeover", "cancel"]) expect(html).toContain(`data-tars-action="${operation}"`);
    for (const view of ["report", "changes", "timeline"]) expect(html).toContain(`data-tars-result-open="${view}"`);
  });

  test("failed: a run that could not go on says Failed, keeps the provider's diagnostic, and offers no report it does not have", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("failed")));
    expect(html).toContain('data-tars-result="failed"');
    expect(html).toContain(">Failed<");
    expect(html).toContain('data-state="failed"');
    expect(html).toContain("The current stage could not start.");
    expect(html).toContain('data-tars-diagnostic=""');
    expect(html).not.toContain("data-tars-result-criterion");
    expect(html).not.toContain('data-tars-result-open="report"');
    expect(html).toContain('data-tars-result-open="timeline"');
    expect(html).toContain('data-tars-action="resume"');
    await applyAppLocale("ko");
    try { expect(render(noticeOf(rowOf("failed")))).toContain(">실패<"); } finally { await applyAppLocale("en"); }
  });

  test("a cancel, an older notice and work the view no longer holds stay one row", async () => {
    await applyAppLocale("en");
    const stalled = rowOf("stalled");
    const cancelled = { ...stalled, state: "cancelled" as const, detailCode: "runCancelled" as const };
    expect(render(noticeOf(cancelled), { responsibilities: [cancelled] })).not.toContain("data-tars-result");
    // The work moved on: blocked earlier, completed now.
    const earlier = noticeOf(stalled, { id: "activity-earlier" });
    const completed = { ...stalled, state: "completed" as const };
    const moved = render(earlier, { responsibilities: [completed], activity: [earlier.activity, activityOf(completed, { createdAt: new Date(START.getTime() + 60_000).toISOString() })] });
    expect(moved).not.toContain("data-tars-result");
    expect(moved).toContain(">Blocked<");
    // Blocked twice: only the newer notice carries the card and its controls.
    const later = noticeOf(stalled, { id: "activity-later", createdAt: new Date(START.getTime() + 120_000).toISOString() });
    const between = activityOf({ ...stalled, state: "running" }, { id: "activity-between", createdAt: new Date(START.getTime() + 60_000).toISOString() });
    expect(render(earlier, { activity: [earlier.activity, between, later.activity] })).not.toContain("data-tars-result");
    expect(render(later, { activity: [earlier.activity, between, later.activity] })).toContain('data-tars-result="blocked"');
    expect(render(noticeOf(stalled), { responsibilities: [] })).not.toContain("data-tars-result");
    // Outside the Tars view there is no work to read.
    expect(renderToStaticMarkup(createElement(TarsActivityNoticeLine, { notice: noticeOf(stalled) }))).not.toContain("data-tars-result");
  });

  test("without a side view the card offers no view buttons", async () => {
    await applyAppLocale("en");
    const html = render(noticeOf(rowOf("verified")), { actions: { ...actions, onOpenSide: undefined } });
    expect(html).toContain('data-tars-result="completed"');
    expect(html).not.toContain("data-tars-result-open");
  });
});
