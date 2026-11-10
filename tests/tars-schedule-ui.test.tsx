import { afterEach, describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsReceiptRow } from "../src/components/tars/TarsReceiptRow";
import { TarsScheduleCard, TarsScheduleProposal, TarsScheduleRecordLine, TarsScheduleRunLine } from "../src/components/tars/TarsSchedule";
import { TarsSchedulesSection } from "../src/components/tars/TarsSchedulesSection";
import type { TarsScheduleContext } from "../src/components/tars/use-tars-schedules";
import type { TarsActionReceipt } from "../src/lib/tars/conversation";
import { describeTarsScheduleLastRun, describeTarsScheduleNext, describeTarsScheduleNextRuns, describeTarsScheduleRule } from "../src/lib/tars/schedule-view";
import type {
  TarsScheduleAction, TarsSchedulePreview, TarsScheduleProposalView, TarsScheduleRecord, TarsScheduleRun, TarsScheduleSource, TarsScheduleView,
} from "../src/lib/tars/schedules";

/**
 * How schedules read in the Tars view: the card, its keys, the record lines,
 * the run line whose actor is the schedule, and the list. Rendered to markup.
 * Times are formatted in the machine's own zone, so a test compares them with
 * what the view's own formatter gives; the browser test pins the exact words
 * in a fixed zone.
 */

afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

const RULE = { kind: "recurring" as const, schedule: { every: 1, unit: "weeks" as const, at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] } };
const WORKSPACE = { id: "source", name: "Source", branch: "main", repositoryName: "Project" };
const NEXT = ["2026-11-10T00:00:00.000Z", "2026-11-11T00:00:00.000Z"];
const CREATE: TarsScheduleAction = { kind: "schedule", operation: "create", title: "Check the release branch", request: "Check the release branch.", workspaceId: "source",
  when: { kind: "recurring", every: 1, unit: "weeks", at: { hour: 9, minute: 0 }, weekdays: [1, 2, 3, 4, 5] } };
const view = (action: TarsScheduleAction = CREATE, patch: Partial<TarsScheduleProposalView> = {}): TarsScheduleProposalView =>
  ({ requestId: "schedule:m1:0", messageId: "m1", actionIndex: 0, action, state: "waiting", record: null, ...patch });
const preview = (patch: Partial<TarsSchedulePreview> = {}): TarsSchedulePreview => ({ requestId: "schedule:m1:0", operation: "create", reason: null, error: null, scheduleId: "tars-1",
  next: { title: "Check the release branch", request: "Check the release branch.", workspace: WORKSPACE, rule: RULE }, current: null, timezone: "Asia/Seoul", nextRuns: NEXT,
  enabledAfter: false, canEnableOnCreate: true, ...patch });
const record = (patch: Partial<TarsScheduleRecord> = {}): TarsScheduleRecord => ({ requestId: "schedule:m1:0", source: "click", requestHash: "a".repeat(64), operation: "create",
  proposal: { messageId: "m1", actionIndex: 0 }, scheduleId: "tars-1", enable: true, status: "applied", reason: null, error: null,
  summary: { title: "Check the release branch", workspace: WORKSPACE, rule: RULE, timezone: "Asia/Seoul", enabled: true, nextRuns: NEXT }, revision: 2,
  createdAt: "2026-11-09T23:00:00.000Z", updatedAt: "2026-11-09T23:00:00.000Z", ...patch });
const run = (patch: Partial<TarsScheduleRun> = {}): TarsScheduleRun => ({ runId: "run-1", scheduleId: "tars-1", title: "Check the release branch", actor: "schedule", status: "running",
  scheduledFor: NEXT[0]!, startedAt: "2026-11-10T00:00:03.000Z", completedAt: null, workspaceId: "source", repositoryPath: "/tmp/project", taskId: "task-1", error: null,
  updatedAt: "2026-11-10T00:00:03.000Z", ...patch });
const schedule = (patch: Partial<TarsScheduleView> = {}): TarsScheduleView => ({ id: "tars-1", title: "Check the release branch", request: "Check the release branch.", workspace: WORKSPACE,
  rule: RULE, timezone: "Asia/Seoul", enabled: true, nextRuns: NEXT, lastRun: null, editedElsewhere: false, createdAt: "2026-11-09T23:00:00.000Z", ...patch });

/** Renders the card and returns its markup and root key handler, so a test presses the real handler without a DOM. */
function card(action: TarsScheduleAction, props: Partial<Parameters<typeof TarsScheduleCard>[0]> = {}) {
  const calls: { confirm: Array<[TarsScheduleSource, boolean | undefined]>; decline: number } = { confirm: [], decline: 0 };
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() {
    sink.tree = TarsScheduleCard({ view: view(action), preview: preview({ operation: action.operation as TarsSchedulePreview["operation"] }), previewState: "ready",
      onConfirm: (source, enable) => { calls.confirm.push([source, enable]); }, onDecline: () => { calls.decline++; }, ...props });
    return sink.tree;
  }
  const html = renderToStaticMarkup(createElement(Capture));
  const root = isValidElement(sink.tree) ? sink.tree.props as { onKeyDown: (event: unknown) => void } : null;
  return { html, root: root!, calls };
}
const press = (key: string) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, target: null, nativeEvent: { isComposing: false },
  preventDefault: () => undefined, stopPropagation: () => undefined });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
/** The two next runs as the view words them here: local times, then the zone's name. */
const nextRunsText = () => describeTarsScheduleNextRuns(NEXT, "Asia/Seoul");

describe("schedule card", () => {
  test("a new schedule states what runs, where, when and the next two runs with the zone, and that it starts paused", () => {
    const { html } = card(CREATE);
    const words = text(html);
    expect(words).toContain("Create this schedule?");
    expect(words).toContain("Nothing is created until you confirm.");
    expect(words).toContain("What runs Check the release branch.");
    expect(words).toContain("Where Source (main) · Project");
    expect(words).toContain("When Every weekday at 09:00");
    expect(words).toContain(`Next runs ${nextRunsText()}`);
    // Two local times and the zone they are read in.
    expect(nextRunsText()).toMatch(/Nov \d{1,2}.*Nov \d{1,2}.*\(Asia\/Seoul\)$/);
    expect(words).toContain("A new schedule is saved paused");
    expect(words).toContain("asks you before risky actions");
    // Create (paused) is the Enter default; Create and turn on is offered beside it because the service allows it.
    expect(html).toContain('data-tars-schedule-confirm="paused"');
    expect(html).toContain('data-tars-schedule-confirm="enabled"');
    expect(html).toContain('aria-keyshortcuts="Enter"');
  });

  test("Create and turn on is offered only when the service allows it", () => {
    expect(card(CREATE, { preview: preview({ canEnableOnCreate: false }) }).html).not.toContain('data-tars-schedule-confirm="enabled"');
  });

  test("Enter creates it paused, the second button turns it on, Esc declines", () => {
    const { root, calls } = card(CREATE);
    root.onKeyDown(press("Enter"));
    expect(calls.confirm).toEqual([["key", undefined]]);
    root.onKeyDown(press("Escape"));
    expect(calls.decline).toBe(1);
  });

  test("removing is marked as irreversible and has no Enter", () => {
    const remove: TarsScheduleAction = { kind: "schedule", operation: "remove", scheduleId: "tars-1" };
    const current = { ...preview().next!, enabled: true };
    const { html, root, calls } = card(remove, { preview: preview({ operation: "remove", current, nextRuns: [] }) });
    expect(text(html)).toContain("Remove this schedule?");
    expect(text(html)).toContain("Can't be undone");
    expect(text(html)).not.toContain("Next runs");
    expect(html).not.toContain('aria-keyshortcuts="Enter"');
    root.onKeyDown(press("Enter"));
    expect(calls.confirm).toEqual([]);
    root.onKeyDown(press("Escape"));
    expect(calls.decline).toBe(1);
  });

  test("a change shows what it is now under each value that changes", () => {
    const change: TarsScheduleAction = { kind: "schedule", operation: "update", scheduleId: "tars-1", title: "Check daily" };
    const next = { ...preview().next!, title: "Check daily", rule: { kind: "recurring" as const, schedule: { every: 1, unit: "days" as const, at: { hour: 10, minute: 30 } } } };
    const { html } = card(change, { preview: preview({ operation: "update", next, current: { ...preview().next!, enabled: false }, enabledAfter: false }) });
    expect(html).toContain('data-tars-schedule-was="title"');
    expect(html).toContain('data-tars-schedule-was="rule"');
    expect(html).not.toContain('data-tars-schedule-was="request"');
    expect(text(html)).toContain("Now: Every weekday at 09:00");
    expect(text(html)).toContain("This schedule is paused.");
  });

  test("a card the host would refuse says why and cannot be confirmed by button or key", () => {
    const { html, root, calls } = card(CREATE, { preview: preview({ reason: "pastTime", error: "Past." }) });
    expect(text(html)).toContain("That time has already passed.");
    expect(html).toMatch(/data-tars-schedule-confirm="paused"[^>]*disabled|disabled[^>]*data-tars-schedule-confirm="paused"/);
    root.onKeyDown(press("Enter"));
    expect(calls.confirm).toEqual([]);
  });

  test("before its facts are read it says so and cannot be confirmed; a failed read offers a retry", () => {
    const loading = card(CREATE, { preview: null, previewState: "loading" });
    expect(text(loading.html)).toContain("Reading the schedule…");
    loading.root.onKeyDown(press("Enter"));
    expect(loading.calls.confirm).toEqual([]);
    const failed = card(CREATE, { preview: null, previewState: "failed", onRetry: () => undefined });
    expect(text(failed.html)).toContain("The schedule could not be read.");
    expect(failed.html).toContain("data-tars-schedule-retry");
  });

  test("the card reads in Korean with local time and the zone", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const words = text(card(CREATE).html);
    expect(words).toContain("이 일정을 만드시겠습니까?");
    expect(words).toContain("(Asia/Seoul)");
    expect(words).toContain("만들고 켜기");
  });
});

describe("schedule records", () => {
  const context = (patch: Partial<TarsScheduleContext> = {}): TarsScheduleContext => ({ proposals: [], records: [], runs: [], previewOf: () => ({ preview: preview(), state: "ready" }),
    retryPreview: () => undefined, busyId: null, errors: new Map(), declined: new Set(), onConfirm: () => undefined, onDecline: () => undefined,
    list: { state: "ready", value: { timezone: "Asia/Seoul", schedules: [], omitted: 0 }, reload: () => undefined }, onToggle: () => undefined, listRequests: 0, ...patch });

  test("a confirmation is the user's record: what was done, to which schedule, and when it runs next", () => {
    const html = renderToStaticMarkup(createElement(TarsScheduleRecordLine, { record: record() }));
    expect(html).toContain('data-tars-record-actor="you"');
    expect(text(html)).toContain("Schedule created and turned on");
    expect(text(html)).toContain(`Next runs: ${describeTarsScheduleNextRuns(NEXT, "Asia/Seoul", new Date(record().createdAt))}`);
    const paused = record({ enable: false, summary: { ...record().summary!, enabled: false, nextRuns: [] } });
    expect(text(renderToStaticMarkup(createElement(TarsScheduleRecordLine, { record: paused })))).toContain("Schedule created, paused");
  });

  test("a refused confirmation says why in the user's language, never the host's diagnostic", () => {
    const refused = record({ status: "rejected", reason: "editedElsewhere", error: "Host diagnostic.", summary: null });
    const html = renderToStaticMarkup(createElement(TarsScheduleRecordLine, { record: refused, fallbackTitle: "Check the release branch" }));
    expect(text(html)).toContain("Schedule not changed");
    expect(text(html)).toContain("changed in Schedules after Tars set it");
    expect(html).not.toContain("Host diagnostic.");
  });

  test("a scheduled run's actor is the schedule, not the user or Tars", () => {
    const html = renderToStaticMarkup(createElement(TarsScheduleRunLine, { run: run(), onOpenTask: () => undefined }));
    expect(html).toContain('data-tars-record-actor="schedule"');
    expect(html).not.toContain('data-tars-record-actor="you"');
    expect(html).not.toContain('data-tars-record-actor="tars"');
    expect(html).toContain("A schedule started this, not you");
    expect(text(html)).toContain("Scheduled run started");
    expect(html).toContain('data-tars-schedule-open-task="task-1"');
    const skipped = renderToStaticMarkup(createElement(TarsScheduleRunLine, { run: run({ status: "skipped", taskId: null, error: "Skipped because the automation reached its concurrency limit (1)." }) }));
    expect(text(skipped)).toContain("Scheduled run skipped");
    expect(text(skipped)).toContain("concurrency limit");
    expect(skipped).not.toContain("data-tars-schedule-open-task");
  });

  test("a proposal shows its card while it waits, one line once declined, its record once confirmed", () => {
    const waiting = renderToStaticMarkup(createElement(TarsScheduleProposal, { view: view(), schedule: context() }));
    expect(waiting).toContain("data-tars-schedule-card");
    const declined = renderToStaticMarkup(createElement(TarsScheduleProposal, { view: view(), schedule: context({ declined: new Set(["schedule:m1:0"]) }) }));
    expect(declined).not.toContain("data-tars-schedule-card");
    expect(text(declined)).toContain("Declined. No schedule was changed.");
    const settled = renderToStaticMarkup(createElement(TarsScheduleProposal, { view: view(CREATE, { state: "settled", record: record() }), schedule: context() }));
    expect(settled).not.toContain("data-tars-schedule-card");
    expect(settled).toContain('data-tars-schedule-record="applied"');
  });

  test("a schedule proposal refused when it was made is a receipt line with its translated reason; a list says it opened", () => {
    const base = { messageId: "m1", actionIndex: 0, requestHash: "a".repeat(64), responsibilityId: null, revision: 2, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" };
    const refused = { ...base, action: CREATE, status: "rejected", error: "Tars did not create this schedule. Change it in Schedules.", reason: "notTarsSchedule" } as TarsActionReceipt;
    const html = renderToStaticMarkup(createElement(TarsReceiptRow, { receipt: refused }));
    expect(text(html)).toContain("New schedule");
    expect(text(html)).toContain("Tars did not create this schedule, so it does not change it.");
    const followUp = { ...refused, reason: "notByFollowUp" } as TarsActionReceipt;
    expect(text(renderToStaticMarkup(createElement(TarsReceiptRow, { receipt: followUp })))).toContain("An automatic follow-up cannot set up or change a schedule.");
    const list = { ...base, action: { kind: "schedule", operation: "list" }, status: "applied", error: null, reason: null } as TarsActionReceipt;
    expect(text(renderToStaticMarkup(createElement(TarsReceiptRow, { receipt: list })))).toContain("Show schedules List opened");
  });

  test("the list shows each schedule's rule, where it runs, its next run, last outcome and a switch", () => {
    const list = { timezone: "Asia/Seoul", omitted: 2, schedules: [schedule(),
      schedule({ id: "tars-2", title: "Edited one", enabled: false, nextRuns: [], editedElsewhere: true,
        lastRun: { status: "failed", at: "2026-11-09T22:00:00.000Z", trigger: "scheduled", taskId: null, workspaceId: "source" } })] };
    const html = renderToStaticMarkup(createElement(TarsSchedulesSection, { context: context({ list: { state: "ready", value: list, reload: () => undefined } }), onOpenSchedules: () => undefined }));
    const words = text(html);
    expect(html).toContain('data-tars-schedules-count="2"');
    expect(words).toContain("Every weekday at 09:00 · Source (main) · Project");
    expect(words).toContain(describeTarsScheduleNext(schedule()));
    expect(describeTarsScheduleNext(schedule())).toMatch(/^Next: \w{3}, Nov \d{1,2}/);
    expect(words).toContain("Not run yet");
    expect(words).toContain("Paused");
    expect(words).toContain("Changed in Schedules. Manage it there.");
    expect(words).toContain("2 more in Schedules");
    expect(words).toContain("Times are in Asia/Seoul.");
    expect(words).toContain("Open Schedules");
    // The first is on; the one edited elsewhere cannot be switched from here.
    expect(html).toMatch(/aria-checked="true"[^>]*data-tars-schedule-switch="tars-1"|data-tars-schedule-switch="tars-1"[^>]*aria-checked="true"/);
    expect(html).toMatch(/data-tars-schedule-switch="tars-2"[^>]*(disabled|aria-disabled="true")|(disabled|aria-disabled="true")[^>]*data-tars-schedule-switch="tars-2"/);
  });

  test("an empty list is folded and says how to ask; an unreadable one offers a retry", () => {
    const empty = renderToStaticMarkup(createElement(TarsSchedulesSection, { context: context(), onOpenSchedules: () => undefined }));
    expect(empty).toContain('data-tars-schedules-count="0"');
    expect(empty).toContain('aria-expanded="false"');
    const failed = renderToStaticMarkup(createElement(TarsSchedulesSection, { context: context({ list: { state: "failed", value: null, reload: () => undefined } }), onOpenSchedules: () => undefined }));
    expect(failed).toContain('data-tars-schedules-count="0"');
  });
});

describe("how a schedule is worded", () => {
  const at = new Date("2026-11-09T23:00:00.000Z");
  test("rules, next runs and last outcomes", () => {
    expect(describeTarsScheduleRule(RULE)).toBe("Every weekday at 09:00");
    expect(describeTarsScheduleRule({ kind: "once", runAt: "2026-11-11T06:00:00.000Z" }, at)).toMatch(/^Once, \w{3}, Nov \d{1,2}\b.*\d{1,2}:\d{2}/);
    expect(describeTarsScheduleRule({ kind: "once", runAt: "2026-11-11T06:00:00.000Z" }, at)).not.toContain("2026");
    // Another year is said, so "Jan 4" is never read as this year's.
    expect(describeTarsScheduleRule({ kind: "once", runAt: "2027-01-04T00:00:00.000Z" }, at)).toContain("2027");
    expect(describeTarsScheduleNextRuns([], "Asia/Seoul")).toBe("No upcoming run");
    expect(describeTarsScheduleNext(schedule(), at)).toMatch(/^Next: \w{3}, Nov \d{1,2}/);
    expect(describeTarsScheduleNext(schedule({ enabled: false, nextRuns: [] }), at)).toBe("Paused");
    // A one-time schedule that ran is finished, not paused.
    expect(describeTarsScheduleNext(schedule({ enabled: false, nextRuns: [], rule: { kind: "once", runAt: "2026-11-09T06:00:00.000Z" },
      lastRun: { status: "completed", at: "2026-11-09T06:05:00.000Z", trigger: "scheduled", taskId: "task-1", workspaceId: "source" } }), at)).toBe("Finished");
    expect(describeTarsScheduleLastRun(null, at)).toBe("Not run yet");
    expect(describeTarsScheduleLastRun({ status: "failed", at: "2026-11-09T21:00:00.000Z", trigger: "scheduled", taskId: null, workspaceId: "source" }, at)).toBe("Last run: failed 2h ago");
  });
});
