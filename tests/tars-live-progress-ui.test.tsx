import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import type { ProviderTurnActivitySnapshot } from "../src/lib/providers/turn-status";
import { projectTarsLiveProgress, TARS_PROGRESS_STALE_MS } from "../src/lib/tars/live-progress";
import type { TarsSideViewTarget } from "../src/lib/tars/side-view";
import type { TarsActivity, TarsResponsibility } from "../src/lib/tars/types";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { TarsLiveLine, TarsRecentProgress, TarsRunningStrip } from "../src/components/tars/TarsLiveProgress";
import { TarsStateTag } from "../src/components/tars/TarsRunMonitor";
import { TarsActivityNoticeLine, TarsFlowBlock } from "../src/components/tars/TarsFlowBlock";
import { TarsTimelinePanel } from "../src/components/tars/TarsTimelinePanel";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { describeTarsNavLabel, describeTarsNavStatus, TarsNavStatus } from "../src/components/tars/TarsNavStatus";
import { buildTarsFlow } from "../src/lib/tars/flow-model";

const start = new Date("2026-11-05T00:00:00.000Z");
const msAt = (minutes: number) => start.getTime() + minutes * 60_000;

function fixture() {
  const f = buildTarsTrayFixtures(start);
  const row = f.responsibilities.find((candidate) => candidate.id === f.ids.billing)!;
  return { f, row, run: f.runs[row.agentRunId!]! };
}

function turn(minutes: number, patch: Partial<ProviderTurnActivitySnapshot> = {}): ProviderTurnActivitySnapshot {
  const when = msAt(minutes);
  return {
    turnId: "turn-1", providerId: "codex", startedAt: when - 60_000, lastEventAt: when, stalledAt: null, pendingInteraction: null,
    orderedWorkItemIds: ["test"],
    workItemsById: { test: { id: "test", kind: "tool", status: "running", title: "Run command", toolName: "Bash", detail: "bun test", progressMessages: [], startedAt: when, updatedAt: when } },
    ...patch,
  } as unknown as ProviderTurnActivitySnapshot;
}

const line = (row: Pick<TarsResponsibility, "id" | "state" | "agentRunId">, run: AgentRunDetail | undefined, turnActivity: ProviderTurnActivitySnapshot | null, now: number) =>
  renderToStaticMarkup(createElement(TarsLiveLine, { row, live: projectTarsLiveProgress({ row, run, turnActivity, now }), now }));

describe("Tars live progress UI", () => {
  test("the live line says what the turn does and when it was seen, and nothing it did not observe", async () => {
    await applyAppLocale("en");
    const { row, run } = fixture();
    const live = line(row, run, turn(9.9), msAt(10));
    expect(live).toContain('data-tars-live-freshness="live"');
    expect(live).toContain("Running the tests");
    expect(live).toMatch(/seen (just now|\d+s ago)/);
    // Between turns: no invented activity, only the last update.
    const between = line(row, run, turn(8, { completedAt: msAt(8.5) }), msAt(10));
    expect(between).toContain('data-tars-live-freshness="recent"');
    expect(between).toContain("No turn running right now");
    expect(between).toContain("Last update 1m ago");
    expect(between).not.toContain("Running the tests");
    // No turn relayed yet (after a restart): unknown, never "no turn running".
    const unknown = line(row, run, null, msAt(10));
    expect(unknown).toContain('data-tars-live-turn="unknown"');
    expect(unknown).toContain("No turn activity observed yet");
    expect(unknown).not.toContain("No turn running right now");
    // An open turn that has not reported a step yet: said as such, never "Thinking · seen just now".
    const open = line(row, run, turn(0, { lastEventAt: msAt(10), orderedWorkItemIds: [], workItemsById: {} }), msAt(10));
    expect(open).toContain("Turn in progress · no step observed yet");
    expect(open).not.toContain("seen");
  });

  test("a stale run keeps its last step in the warning line, with that step's age", async () => {
    await applyAppLocale("en");
    const { row, run } = fixture();
    // A long command started at minute 9 and nothing came after it.
    const stale = line(row, run, turn(9), msAt(9) + TARS_PROGRESS_STALE_MS + 2 * 60_000);
    expect(stale).toContain('data-tars-live-freshness="stale"');
    expect(stale).toContain("Last step: Running the tests, 7m ago · progress may be out of date");
  });

  test("progress observed too long ago is marked out of date in the warning ink, as a status", async () => {
    await applyAppLocale("en");
    const { row, run } = fixture();
    const stale = line(row, run, null, msAt(9) + TARS_PROGRESS_STALE_MS + 2 * 60_000);
    expect(stale).toContain('data-tars-live-freshness="stale"');
    expect(stale).toContain('role="status"');
    expect(stale).toContain("Nothing observed for 7m · progress may be out of date");
    await applyAppLocale("ko");
    try {
      expect(line(row, run, null, msAt(9) + TARS_PROGRESS_STALE_MS + 2 * 60_000)).toContain("7분 동안 관측 없음 · 진행 정보가 오래됐을 수 있습니다");
    } finally { await applyAppLocale("en"); }
  });

  test("without an observed run the line says so: not started, or not observed, never a guess", async () => {
    await applyAppLocale("en");
    const { row } = fixture();
    expect(line(row, undefined, turn(9.9), msAt(10))).toContain("No run observation yet");
    expect(line({ ...row, state: "preparing", agentRunId: "run-new" }, undefined, null, msAt(10))).toContain("No run observation yet");
    // Waiting, paused, queued and ended work without a run shows no line at all.
    expect(line({ ...row, state: "queued", agentRunId: null }, undefined, null, msAt(10))).toBe("");
    expect(line({ ...row, state: "completed" }, fixture().run, null, msAt(10))).toBe("");
    // Waiting work with a run shows its last update, never the turn's words.
    const waiting = line({ ...row, state: "waiting" }, fixture().run, turn(9.9), msAt(10));
    expect(waiting).toContain("Last update 1m ago");
    expect(waiting).not.toContain("Running the tests");
  });

  test("running, waiting, blocked and completed wear distinct tones, and only running moves", () => {
    const tag = (state: TarsResponsibility["state"]) => renderToStaticMarkup(createElement(TarsStateTag, { state }));
    expect(tag("running")).toContain('data-tone="info"');
    expect(tag("running")).toContain('data-motion="moving"');
    for (const [state, tone] of [["waiting", "neutral"], ["queued", "neutral"], ["paused", "neutral"], ["takenOver", "neutral"], ["blocked", "warning"], ["completed", "success"]] as const) {
      expect(tag(state)).toContain(`data-tone="${tone}"`);
      expect(tag(state)).not.toContain('data-motion="moving"');
    }
  });

  test("a conversation notice says the state's own word: a block is Blocked, not just needs you", async () => {
    await applyAppLocale("en");
    const activity = (state: TarsActivity["state"]): TarsActivity => ({ id: `a-${state}`, responsibilityId: "r", revision: 2, title: "Fix export", state, detail: null, createdAt: start.toISOString() });
    const blocked = renderToStaticMarkup(createElement(TarsActivityNoticeLine, { notice: { activity: activity("blocked"), kind: "blocked" } }));
    expect(blocked).toContain(">Blocked<");
    expect(blocked).not.toContain("Needs you");
    expect(blocked).toContain('data-state="halted"');
    const completed = renderToStaticMarkup(createElement(TarsActivityNoticeLine, { notice: { activity: activity("completed"), kind: "completed" } }));
    expect(completed).toContain(">Completed<");
    expect(completed).toContain('data-state="ready"');
    await applyAppLocale("ko");
    try {
      expect(renderToStaticMarkup(createElement(TarsActivityNoticeLine, { notice: { activity: activity("blocked"), kind: "blocked" } }))).toContain(">진행 불가<");
    } finally { await applyAppLocale("en"); }
  });

  test("a message Tars is still writing reads as running; a queued one as queued", async () => {
    await applyAppLocale("en");
    const message = (state: "queued" | "reasoning") => renderToStaticMarkup(createElement(TarsConversationMessage, {
      message: { id: `m-${state}`, requestId: `r-${state}`, text: "What runs now?", providerId: "codex", model: "gpt-5.5", maxTurns: 30, revision: 1, state,
        reply: null, decision: null, error: null, createdAt: start.toISOString(), updatedAt: start.toISOString() },
      receipts: [], name: "Tars", busy: false, onCancel() {},
    }));
    expect(message("reasoning")).toContain('data-tars-message-state="reasoning"');
    expect(message("reasoning")).toContain('data-motion="moving"');
    expect(message("reasoning")).toContain('data-state="working"');
    expect(message("queued")).toContain('data-state="queued"');
    expect(message("queued")).not.toContain('data-motion="moving"');
  });

  test("the folded flow wears the work's state mark and keeps its live line in view", async () => {
    await applyAppLocale("en");
    const { f, row, run } = fixture();
    const flow = buildTarsFlow({ receipt: f.receipt, row, run })!;
    const html = renderToStaticMarkup(createElement(TarsFlowBlock, { flow, live: createElement("p", { "data-live-probe": "" }, "Running the tests") }));
    expect(html).toContain('data-tars-flow-state="running"');
    expect(html).toContain('data-motion="moving"');
    expect(html).toContain("data-tars-flow-live");
    expect(html).toContain("data-live-probe");
  });

  test("recent progress lists the run's entries with their age; nothing when the run recorded none", async () => {
    await applyAppLocale("en");
    const entries = [{ id: "e2", at: new Date(msAt(9)).toISOString(), text: "Cause retried, attempt 2", tone: "neutral" as const },
      { id: "e1", at: new Date(msAt(4)).toISOString(), text: "Reproduce completed", tone: "done" as const }];
    const html = renderToStaticMarkup(createElement(TarsRecentProgress, { entries, now: msAt(10), title: true }));
    expect(html).toContain("Recent progress");
    expect(html.indexOf("Cause retried")).toBeLessThan(html.indexOf("Reproduce completed"));
    expect(html).toContain("1m ago");
    expect(html).toContain("6m ago");
    expect(html).toContain('data-tars-recent-entry="done"');
    expect(renderToStaticMarkup(createElement(TarsRecentProgress, { entries: [], now: msAt(10) }))).toBe("");
  });

  test("the composer band lists only what runs, with its stage and a timeline link, and counts the rest", async () => {
    await applyAppLocale("en");
    const { row, run } = fixture();
    expect(renderToStaticMarkup(createElement(TarsRunningStrip, { items: [] }))).toBe("");
    const opened: TarsSideViewTarget[] = [];
    const element = createElement(TarsRunningStrip, { items: [{ row, run }], onOpenSide: (target: TarsSideViewTarget) => opened.push(target) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-tars-running-strip="1"');
    expect(html).toContain("Fix the billing export on empty invoice lists");
    expect(html).toMatch(/Stage 2 of 3 · [^<]+, attempt 2/);
    expect(html).toContain('data-tars-live-stage="2/3"');
    expect(html).toContain("data-tars-running-timeline");
    const three = [{ row, run }, { row: { ...row, id: "b" }, run }, { row: { ...row, id: "c" }, run }];
    const crowded = renderToStaticMarkup(createElement(TarsRunningStrip, { items: three, onShowAll() {} }));
    expect(crowded.match(/data-tars-running="/g)).toHaveLength(2);
    expect(crowded).toContain("1 more running");
    // Rendering opens nothing; only a press does.
    expect(opened).toHaveLength(0);
  });

  test("the timeline leads with where the run stands and its recent progress", async () => {
    await applyAppLocale("en");
    const { row, run } = fixture();
    const detail: AgentRunDetail = { ...run, events: [
      { id: "e1", agentRunId: run.agentRun.id, sequence: 1, kind: "stage-completed", idempotencyKey: null, detail: { stageId: "reproduce", attempt: 1 }, createdAt: new Date(msAt(4)).toISOString() },
    ] };
    const html = renderToStaticMarkup(createElement(TarsTimelinePanel, { detail, records: [], title: row.title, row }));
    expect(html).toContain("data-tars-timeline-now");
    expect(html).toContain('data-tars-timeline-now-stage="2/3"');
    expect(html).toContain('data-tars-state="running"');
    expect(html).toContain("Recent progress");
    expect(html).toContain("completed");
    expect(html.indexOf("data-tars-timeline-now")).toBeLessThan(html.indexOf("agent-run-stage-"));
  });

  test("a timeline without a run says whether it has not started, never existed, or is not loaded", async () => {
    await applyAppLocale("en");
    const { row } = fixture();
    const empty = (patch: Partial<TarsResponsibility>) => renderToStaticMarkup(createElement(TarsTimelinePanel, { detail: undefined, records: [], title: row.title, row: { ...row, ...patch } }));
    expect(empty({ state: "queued", agentRunId: null })).toContain('data-tars-timeline="notStarted"');
    expect(empty({ state: "cancelled", agentRunId: null })).toContain('data-tars-timeline="noRun"');
    expect(empty({})).toContain('data-tars-timeline="none"');
    expect(empty({})).toContain("No run observation yet");
  });

  test("the sidebar's Tars entry says what runs and what needs the user, in its name too", async () => {
    await applyAppLocale("en");
    expect(renderToStaticMarkup(createElement(TarsNavStatus, { counts: { running: 0, needsYou: 0 } }))).toBe("");
    const html = renderToStaticMarkup(createElement(TarsNavStatus, { counts: { running: 1, needsYou: 2 } }));
    expect(html).toContain('data-tars-nav-running="1"');
    expect(html).toContain('data-motion="moving"');
    expect(html).toContain('data-tars-nav-needs-you="2"');
    expect(describeTarsNavStatus({ running: 1, needsYou: 2 })).toBe("1 running · 2 need you");
    expect(describeTarsNavLabel({ running: 1, needsYou: 0 })).toBe("Tars, 1 running");
    expect(describeTarsNavLabel({ running: 0, needsYou: 0 })).toBe("Tars");
    await applyAppLocale("ko");
    try { expect(describeTarsNavLabel({ running: 1, needsYou: 1 })).toBe("Tars, 실행 1 · 확인 1"); }
    finally { await applyAppLocale("en"); }
  });
});
