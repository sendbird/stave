import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsCardActions, TarsTray, TarsTrayCard, TarsTrayStatusNote, TarsTrayToggle, describeTarsTrayCounts, type TarsTrayActions } from "../src/components/tars/TarsTray";
import { TarsRunMonitor } from "../src/components/tars/TarsRunMonitor";
import { TarsAwayRecap } from "../src/components/tars/TarsAwayRecap";
import type { TarsSideViewTarget } from "../src/lib/tars/side-view";
import { TarsFlowBlock, TarsFlowNodes, TarsFlowStageNode } from "../src/components/tars/TarsFlowBlock";
import { TarsConversation, TarsConversationMessage, type TarsFlowContext } from "../src/components/tars/TarsConversation";
import type { TarsConversationState } from "../src/components/tars/use-tars-conversation";
import { buildTarsFlow } from "../src/lib/tars/flow-model";
import { buildTarsTray, TARS_CONVERSATION_MIN_WIDTH, type TarsTrayDecision } from "../src/lib/tars/tray-model";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import type { FleetFocusTarget } from "../src/store/fleet-focus-store";

const start = new Date("2026-11-05T00:00:00.000Z");
const fixtures = () => buildTarsTrayFixtures(start);
const trayOf = (f: ReturnType<typeof fixtures>) =>
  buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
const noActions: TarsTrayActions = { busy: false, onAct() {}, onConfirm() {}, onOpenTask() {}, onShowInFleet() {} };

/** Renders through a capture component and returns the element tree, so a test can press real handlers without a DOM. */
function capture(render: () => ReactNode) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = render(); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  const handlers: Array<{ label: string; onClick: () => void }> = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as { children?: ReactNode; actions?: ReactNode; trailingActions?: ReactNode; onClick?: () => void; title?: string; "aria-label"?: string; groups?: Array<{ items: Array<{ label: string; onSelect: () => void }> }> };
    // A button's accessible name: its aria-label when it has one (a short visible word such as "Open"), else its text or title.
    if (props.onClick) handlers.push({ label: props["aria-label"] ?? (typeof props.children === "string" ? props.children : props.title ?? ""), onClick: props.onClick });
    // A "More actions" menu's items act like buttons once it is open.
    for (const item of props.groups?.flatMap((group) => group.items) ?? []) handlers.push({ label: item.label, onClick: item.onSelect });
    visit(props.children);
    // The run objects (AUI RunMonitor card and recap) take their controls through slots.
    visit(props.actions);
    visit(props.trailingActions);
  };
  visit(sink.tree);
  return { html, labels: handlers.map((handler) => handler.label), press: (label: string) => handlers.find((handler) => handler.label === label)!.onClick() };
}

async function inKorean(run: () => void) {
  applyAppLocale("ko"); await i18n.changeLanguage("ko");
  try { run(); } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
}

describe("Tars tray UI", () => {
  test("the header indicator names only the lanes that count, in both languages", async () => {
    expect(describeTarsTrayCounts({ running: 2, needsYou: 1, done: 3 })).toBe("2 running · 1 needs you · 3 done");
    expect(describeTarsTrayCounts({ running: 1, needsYou: 2, done: 0 })).toBe("1 running · 2 need you");
    expect(describeTarsTrayCounts({ running: 0, needsYou: 0, done: 0 })).toBe("No work yet");
    await inKorean(() => expect(describeTarsTrayCounts({ running: 2, needsYou: 1, done: 3 })).toBe("진행 2 · 확인 1 · 끝남 3"));
  });

  test("before a successful read the indicator and body say checking or unavailable, never no work", async () => {
    const none = { running: 0, needsYou: 0, done: 0 };
    expect(describeTarsTrayCounts(none, "checking")).toBe("Checking work…");
    expect(describeTarsTrayCounts(none, "unavailable")).toBe("Work unavailable");
    expect(renderToStaticMarkup(createElement(TarsTrayStatusNote, { status: "unavailable" }))).toContain("could not be read");
    const indicator = renderToStaticMarkup(createElement(TarsTrayToggle, { pinned: true, counts: none, status: "checking", open: true, onOpenChange() {}, panelId: "tray", children: null }));
    expect(indicator).toContain("Checking work…");
    expect(indicator).not.toContain("No work yet");
    await inKorean(() => expect(describeTarsTrayCounts(none, "checking")).toBe("맡긴 일 확인 중…"));
  });

  test("the pinned indicator points at the tray only while it is there", () => {
    const toggle = (open: boolean) => renderToStaticMarkup(createElement(TarsTrayToggle, { pinned: true, counts: { running: 1, needsYou: 0, done: 0 }, open, onOpenChange() {}, panelId: "tray-panel", children: null }));
    expect(toggle(true)).toContain('aria-controls="tray-panel"');
    expect(toggle(false)).not.toContain("aria-controls");
  });

  test("the needs-you header says Fleet's row count, the indicator's number, even when one card holds several rows", () => {
    const f = fixtures();
    const signOff = { id: "agent-run-sign-off:release", kind: "agent-run-sign-off", taskId: "task-release" };
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [...f.attentionItems, signOff], runs: f.runs, pendingDecisions: f.pendingDecisions });
    expect(model.lanes.needsYou).toHaveLength(1);
    expect(model.counts.needsYou).toBe(2);
    const html = renderToStaticMarkup(createElement(TarsTray, { model, actions: noActions }));
    expect(html).toContain('data-tars-lane-count="2"');
    expect(describeTarsTrayCounts(model.counts)).toContain("2 need you");
  });

  test("Needs you and Running are open, Done is folded, and every lane says its count", () => {
    const html = renderToStaticMarkup(createElement(TarsTray, { model: trayOf(fixtures()), actions: noActions }));
    for (const label of ["Needs you", "Running", "Done"]) expect(html).toContain(label);
    expect(html).toContain('data-tars-card="release"');
    expect(html).toContain('data-tars-card="billing"');
    expect(html).toContain('data-tars-card="migration"');
    // Only the folded Done lane's panel is hidden, so its card stays out of the reading order until opened.
    expect(html.match(/ hidden=""/g)?.length).toBe(1);
    const hidden = html.indexOf(' hidden=""');
    expect(hidden).toBeGreaterThan(html.indexOf('data-tars-tray-lane="done"'));
    expect(html.indexOf('data-tars-card="docs"')).toBeGreaterThan(hidden);
  });

  test("a running card shows stage, progress, turns left and helpers from its run", () => {
    const f = fixtures();
    const card = trayOf(f).lanes.running.find((value) => value.row.id === f.ids.billing)!;
    const html = renderToStaticMarkup(createElement(TarsTrayCard, { card, actions: noActions }));
    // The run monitor (AUI RunMonitor): the stage it is on, one labelled segment per stage and the step count; the state tag wears its mark.
    expect(html).toContain("Now: Cause, attempt 2");
    expect(html).toContain('data-run-segments="done,now,pending"');
    expect(html).toContain('data-tars-monitor="billing"');
    expect(html).toContain('data-tars-monitor-count="2/3"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('data-tars-progress="1/3"');
    expect(html).toContain("Owner: Tars · 18 turns left · 2 helpers working");
    expect(html).toContain('data-tars-state="running"');
    expect(html).toContain('data-state="working"');
    // The fixture's stage start is a fixed past time: the clock shows a duration, never a zero placeholder.
    expect(html).toMatch(/data-tars-monitor-elapsed="">\d/);
    // The timeline link only where a side view exists.
    expect(html).not.toContain("data-tars-monitor-timeline");
  });

  test("work without a read run shows no progress and never a zero budget", () => {
    const f = fixtures();
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [], runs: {} });
    const docs = renderToStaticMarkup(createElement(TarsTrayCard, { card: model.lanes.done[0]!, actions: noActions }));
    const billing = renderToStaticMarkup(createElement(TarsTrayCard, { card: model.lanes.running.find((value) => value.row.id === f.ids.billing)!, actions: noActions }));
    for (const html of [docs, billing]) {
      expect(html).not.toContain("turns left");
      expect(html).not.toContain("helpers working");
      expect(html).not.toContain("stages done");
    }
    expect(billing).toContain("Run details are not loaded yet.");
    expect(docs).not.toContain("Run details are not loaded yet.");
  });

  test("a Tars decision row confirms the proposal through the host path; Show in Fleet targets the task row", () => {
    const f = fixtures();
    const card = trayOf(f).lanes.needsYou[0]!;
    const confirmed: TarsTrayDecision[] = [];
    const fleet: FleetFocusTarget[] = [];
    const props = { card, actions: { ...noActions, onConfirm: (value: TarsTrayDecision) => confirmed.push(value), onShowInFleet: (target: FleetFocusTarget) => fleet.push(target) } };
    const html = renderToStaticMarkup(createElement(TarsTrayCard, props));
    expect(html).toContain("Tars decision waiting");
    expect(html).toContain("Tars proposes to resume this work.");
    const view = capture(() => TarsCardActions(props));
    // Confirm takes Resume's place: the same control never shows twice, and the rest sits in the menu.
    expect(view.labels).toEqual(["Confirm resume", "Open task", "Take over", "Show in Fleet", "Cancel responsibility"]);
    expect(view.html).not.toContain(">Resume<");
    expect(view.html).toContain('aria-label="More actions for Verify the release candidate"');
    view.press("Confirm resume");
    expect(confirmed).toEqual([{ messageId: "message-plan", actionIndex: 1, responsibilityId: f.ids.release, operation: "resume", expectedRevision: 3 }]);
    view.press("Show in Fleet");
    expect(fleet).toEqual([{ workspaceId: "exec-release", taskId: "task-release" }]);
  });

  test("the pinned layout restates the conversation floor the model defines", () => {
    const source = readFileSync(path.join(import.meta.dir, "../src/components/tars/tars-tray.styles.ts"), "utf8");
    expect(source).toContain(`const CONVERSATION_FLOOR = "${TARS_CONVERSATION_MIN_WIDTH}px";`);
  });
});

describe("Tars flow block", () => {
  const flowOf = (f: ReturnType<typeof fixtures>) => buildTarsFlow({ receipt: f.receipt,
    row: f.responsibilities.find((value) => value.id === f.ids.billing), run: f.runs["run-billing"] })!;

  test("folded to one line with the stage count and state, in both languages", async () => {
    const flow = flowOf(fixtures());
    const html = renderToStaticMarkup(createElement(TarsFlowBlock, { flow }));
    expect(html).toContain("1 of 3 stages done · Running");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-tars-flow-nodes");
    await inKorean(() => expect(renderToStaticMarkup(createElement(TarsFlowBlock, { flow }))).toContain("3단계 중 1단계 완료 · 실행 중"));
  });

  test("nodes run request → decision → stages → completion, and a stage opens its task in Fleet", () => {
    const flow = flowOf(fixtures());
    const targets: FleetFocusTarget[] = [];
    const view = capture(() => TarsFlowNodes({ flow, agentNameOf: (id) => id === "debugger" ? "Debugger" : undefined, onShowInFleet: (target) => targets.push(target) }));
    const order = ["Request", "2 completion criteria", "Tars decision", "Assigned to Debugger", "Reproduce", "Cause", "Attempt 2", "Fix", "Completion", "Not finished yet"];
    let cursor = 0;
    for (const text of order) {
      const at = view.html.indexOf(text, cursor);
      expect(at, text).toBeGreaterThanOrEqual(cursor);
      cursor = at + text.length;
    }
    expect(view.html).toContain('aria-current="step"');
    // Stage nodes are buttons, so Tab reaches them and Enter or a click opens Fleet.
    expect((view.html.match(/<button[^>]*data-tars-flow-stage=/g) ?? []).length).toBe(3);
    const cause = flow.progress!.stages[1]!;
    capture(() => TarsFlowStageNode({ stage: cause, target: flow.fleetTarget, onShowInFleet: (target) => targets.push(target) })).press("Show Cause in Fleet");
    expect(targets).toEqual([{ workspaceId: "exec-billing", taskId: "task-billing" }]);
    // Without a task there is no Fleet row, so the stage stays text.
    expect(renderToStaticMarkup(createElement(TarsFlowStageNode, { stage: cause, target: null, onShowInFleet() {} }))).not.toContain("<button");
  });

  test("an applied delegation reads as its flow, not as a second receipt line; other receipts keep theirs", () => {
    const f = fixtures();
    const flows: TarsFlowContext = { flowFor: () => flowOf(f), onShowInFleet() {} };
    const props = { message: f.message, receipts: [f.receipt], name: "Tars", busy: false, onCancel() {} };
    const plain = renderToStaticMarkup(createElement(TarsConversationMessage, props));
    expect(plain).toContain("Accepted for execution");
    expect(plain).not.toContain("data-tars-flow=");
    const flowed = renderToStaticMarkup(createElement(TarsConversationMessage, { ...props, flows }));
    expect(flowed).toContain('data-tars-flow="billing"');
    expect(flowed).not.toContain("Accepted for execution");
  });

  test("the transcript keeps a completion notice and leaves live progress to the tray", () => {
    const f = fixtures();
    const conversation = { settings: null, messages: [f.message], receipts: [f.receipt], activity: f.activity, records: [] };
    const state = { conversation, error: null, busy: false, available: true, refresh: async () => {}, send: async () => null, configure: async () => null, cancel: async () => null } as unknown as TarsConversationState;
    const html = renderToStaticMarkup(createElement(TarsConversation, { state, name: "Tars", initialSettings: { providerId: "codex", model: "test-model", maxTurns: 30 } }));
    expect(html).toContain('data-tars-activity="completed"');
    expect(html).toContain("Update the setup guide");
    expect((html.match(/data-tars-activity=/g) ?? []).length).toBe(1);
  });

  test("Confirm is offered only for a proposal the snapshot still holds; a superseded one says so", async () => {
    const at = "2026-11-05T00:00:00.000Z";
    const action = { kind: "control" as const, responsibilityId: "release", expectedRevision: 3, operation: "resume" as const };
    const message = { id: "message", requestId: "request", text: "Resume it", providerId: "codex" as const, model: "test-model", maxTurns: 30, revision: 2,
      state: "answered" as const, reply: "Confirm to resume.", decision: { reply: "Confirm to resume.", actions: [action] }, error: null, createdAt: at, updatedAt: at };
    const receipt = { messageId: "message", actionIndex: 0, requestHash: "a".repeat(64), action, status: "proposed" as const, responsibilityId: null,
      error: null, reason: null, revision: 2, createdAt: at, updatedAt: at };
    const release = { ...fixtures().responsibilities[0]!, id: "release", state: "paused" as const, revision: 3 };
    // A newer message proposing a control for the same work supersedes this one.
    const newer = { ...message, id: "newer", requestId: "newer", createdAt: "2026-11-05T00:01:00.000Z" };
    const newerReceipt = { ...receipt, messageId: "newer", action: { ...action, operation: "cancel" as const } };
    const render = (responsibilities: typeof release[] | null, superseded = false) => {
      const decisions = projectTarsDecisions({ messages: superseded ? [message, newer] : [message], receipts: superseded ? [receipt, newerReceipt] : [receipt],
        records: [], answers: [], activity: [], responsibilities });
      return renderToStaticMarkup(createElement(TarsConversationMessage, { message, receipts: [receipt], name: "Tars", busy: false, onCancel() {}, decisions, onAnswer() {} }));
    };
    expect(render([release])).toMatch(/<button[^>]*data-tars-decision-option="0"(?![^>]*disabled)/);
    const superseded = render([release], true);
    expect(superseded).toContain("No longer pending");
    expect(superseded).not.toContain("data-tars-decision-option");
    // Without a snapshot nothing is offered on a guess: the card shows, its option is disabled.
    const unknown = render(null);
    expect(unknown).toContain("Awaiting your confirmation");
    expect(unknown).toMatch(/<button[^>]*disabled=""[^>]*data-tars-decision-option="0"|<button[^>]*data-tars-decision-option="0"[^>]*disabled=""/);
    await inKorean(() => expect(render([release], true)).toContain("더 이상 대기하지 않음"));
  });
});

describe("run monitor and away recap", () => {
  test("the timeline link opens the run's timeline at the stage it is on; no start time means no clock", () => {
    const f = fixtures();
    const card = trayOf(f).lanes.running.find((value) => value.row.id === f.ids.billing)!;
    const opened: TarsSideViewTarget[] = [];
    const { html, press } = capture(() => TarsRunMonitor({ row: card.row, progress: card.progress!, onOpenSide: (target) => opened.push(target) }));
    expect(html).toContain('data-tars-monitor-timeline="billing"');
    expect(html).toContain("Open the timeline for Fix the billing export on empty invoice lists");
    press("Open the timeline for Fix the billing export on empty invoice lists");
    expect(opened).toEqual([{ responsibilityId: "billing", kind: "timeline", focus: { stageId: "cause" } }]);
    const unstarted = { ...card.progress!, current: { ...card.progress!.current!, startedAt: null } };
    const quiet = renderToStaticMarkup(createElement(TarsRunMonitor, { row: card.row, progress: unstarted }));
    expect(quiet).not.toContain("data-tars-monitor-elapsed");
    expect(quiet).toContain("Now: Cause, attempt 2");
  });

  test("the recap shows only counts that happened, lists its changes as side view links and dismisses as a view-only action", async () => {
    const recap = { since: "2026-11-05T00:00:00.000Z", counts: { needsYou: 1, failed: 0, done: 2 }, more: 1,
      items: [{ responsibilityId: "release", title: "Verify the release candidate", kind: "needsYou" as const, at: "2026-11-05T00:06:00.000Z", side: { responsibilityId: "release", kind: "timeline" as const } },
        { responsibilityId: "docs", title: "Update the setup guide", kind: "done" as const, at: "2026-11-05T00:03:00.000Z", side: { responsibilityId: "docs", kind: "report" as const } }] };
    let dismissed = 0;
    const opened: TarsSideViewTarget[] = [];
    const { html, press } = capture(() => TarsAwayRecap({ recap, onOpenSide: (target) => opened.push(target), onDismiss: () => { dismissed++; } }));
    expect(html).toContain("While you were away");
    expect(html).toContain('data-tars-recap-count="needsYou"');
    expect(html).toContain('data-tars-recap-count="done"');
    expect(html).not.toContain('data-tars-recap-count="failed"');
    expect(html).toContain("1 needs you");
    expect(html).toContain("2 done");
    expect(html).toContain("And 1 more in the lanes below.");
    expect(html).toContain('aria-label="Open Update the setup guide: Done"');
    press("Open Update the setup guide: Done");
    expect(opened).toEqual([{ responsibilityId: "docs", kind: "report" }]);
    press("Dismiss the summary of changes while you were away");
    expect(dismissed).toBe(1);
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const korean = renderToStaticMarkup(createElement(TarsAwayRecap, { recap, onDismiss() {} }));
    for (const text of ["자리를 비운 사이", "확인 필요 1", "끝남 2"]) expect(korean).toContain(text);
    applyAppLocale("en"); await i18n.changeLanguage("en");
  });
});

describe("irreversible confirmations in the tray", () => {
  const releaseCard = (operation: "cancel" | "resume") => {
    const f = fixtures();
    const pendingDecisions = f.pendingDecisions.map((decision) => ({ ...decision, operation }));
    return buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions }).lanes.needsYou[0]!;
  };

  test("a proposed cancel is not a filled primary button and carries the can't-be-undone tag; a resume stays primary", () => {
    const cancel = renderToStaticMarkup(createElement(TarsTrayCard, { card: releaseCard("cancel"), actions: noActions }));
    const confirmCancel = cancel.match(/<button[^>]*data-tars-action="confirm"[^>]*>/)![0];
    expect(confirmCancel).not.toContain('data-variant="primary"');
    expect(confirmCancel).toContain('data-tone="danger"');
    expect(cancel).toContain("Confirm cancel");
    expect(cancel).toContain("data-tars-decision-risk-tag");
    expect(cancel).toContain("Can&#x27;t be undone");
    const resume = renderToStaticMarkup(createElement(TarsTrayCard, { card: releaseCard("resume"), actions: noActions }));
    expect(resume.match(/<button[^>]*data-tars-action="confirm"[^>]*>/)![0]).toContain('data-variant="primary"');
    expect(resume).not.toContain("data-tars-decision-risk-tag");
  });
});

describe("Tars run monitor agent motion", () => {
  test("the state word renders once, settled, inside the Tars state tag", async () => {
    await applyAppLocale("en");
    const { TarsStateTag } = await import("../src/components/tars/TarsRunMonitor");
    const markup = renderToStaticMarkup(createElement(TarsStateTag, { state: "paused" }));
    const word = i18n.t("shell:tars.states.paused");
    // A mount shows one copy of the word: the text-swap layer adds no leaving copy.
    expect(markup.split(word).length - 1).toBe(1);
    expect(markup).toContain('data-tars-state="paused"');
    // The word sits in the text-swap layer, so a state change fades it over.
    const { AgentTextSwap } = await import("../src/components/aui/components/agent-motion");
    const rollClass = /class="([^"]+)"/.exec(renderToStaticMarkup(createElement(AgentTextSwap, { swapKey: "probe" }, "probe")))?.[1];
    expect(rollClass).toBeTruthy();
    expect(markup).toContain(`class="${rollClass}"`);
  });
});
