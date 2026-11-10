import { describe, expect, test } from "bun:test";
import { tarsRecordText } from "./tars-record-text";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsTrayCard, TarsOutputList, describeTarsTrayCounts, type TarsTrayActions } from "../src/components/tars/TarsTray";
import { TarsFlowStageNode, tarsFlowStageTarget } from "../src/components/tars/TarsFlowBlock";
import { TarsBlockedNextSteps } from "../src/components/tars/TarsBlockedNextSteps";
import { TarsReportPanel, describeTarsCriterionSource, describeTarsEvidenceRevision } from "../src/components/tars/TarsReportPanel";
import { keepTarsDiffSelection } from "../src/components/tars/TarsChangesPanel";
import { EvidenceList } from "../src/components/agent-runs/EvidenceList";
import { TarsReviewPanel } from "../src/components/tars/TarsReviewPanel";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import { buildTarsTray } from "../src/lib/tars/tray-model";
import { buildTarsOutputs } from "../src/lib/tars/outputs-model";
import { projectTarsReport, projectTarsReview } from "../src/lib/tars/report-model";
import { buildTarsFlow } from "../src/lib/tars/flow-model";
import type { TarsSideViewTarget } from "../src/lib/tars/side-view";
import type { TarsControlOperation, TarsResponsibility } from "../src/lib/tars/types";
import type { FleetFocusTarget } from "../src/store/fleet-focus-store";

const start = new Date("2026-11-05T00:00:00.000Z");
const fixtures = () => buildTarsSideViewFixtures(start);

/** Renders through a capture component and returns the element tree, so a test can press real handlers without a DOM. */
function capture(render: () => ReactNode) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = render(); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  const handlers: Array<{ label: string; onClick: () => void }> = [];
  const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node
    : isValidElement(node) ? text((node.props as { children?: ReactNode }).children) : "";
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as { children?: ReactNode; onClick?: () => void; title?: string; "aria-label"?: string; groups?: Array<{ items: Array<{ label: string; onSelect: () => void }> }> };
    if (props.onClick) handlers.push({ label: text(props.children) || props["aria-label"] || props.title || "", onClick: props.onClick });
    for (const item of props.groups?.flatMap((group) => group.items) ?? []) handlers.push({ label: item.label, onClick: item.onSelect });
    visit(props.children);
  };
  visit(sink.tree);
  return { html, labels: handlers.map((handler) => handler.label), press: (label: string) => handlers.find((handler) => handler.label === label)!.onClick() };
}

function actionsRecording() {
  const opened: TarsSideViewTarget[] = [];
  const acted: TarsControlOperation[] = [];
  const fleet: FleetFocusTarget[] = [];
  const actions: TarsTrayActions = { busy: false, onAct: (_row: TarsResponsibility, operation) => acted.push(operation), onConfirm() {}, onOpenTask() {},
    onShowInFleet: (target) => fleet.push(target), onOpenSide: (target) => opened.push(target) };
  return { actions, opened, acted, fleet };
}

describe("blocked work navigation (A6)", () => {
  test("a blocked tray card shows its reason and opens the report on its unmet criteria", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const tray = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [], runs: f.runs });
    const card = tray.lanes.needsYou.concat(tray.lanes.running, tray.lanes.done).find((entry) => entry.row.id === "search")!;
    const { actions, opened } = actionsRecording();
    const view = capture(() => TarsTrayCard({ card, actions }));
    expect(view.html).toContain("Stopped with some completion criteria unmet. Open the report to see what is missing.");
    view.press("Open report");
    expect(opened).toEqual([{ responsibilityId: "search", kind: "report", focus: { unmet: true } }]);
    // Without a side view (Fleet's own surfaces), the card has no report link.
    expect(renderToStaticMarkup(createElement(TarsTrayCard, { card, actions: { ...actions, onOpenSide: undefined } }))).not.toContain("data-tars-open-report");
  });

  test("with a Blocked row in its well, the card says the reason once and opens the report from the end of that row", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const search = f.responsibilities.find((row) => row.id === "search")!;
    const blocked = { id: "tars:blocked:search", kind: "tars-blocked", taskId: search.taskId!, tarsResponsibilityId: search.id };
    const tray = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [blocked], runs: f.runs });
    const card = Object.values(tray.lanes).flat().find((entry) => entry.row.id === "search")!;
    const { actions, opened } = actionsRecording();
    const view = capture(() => TarsTrayCard({ card, actions }));
    expect(view.html.split("Stopped with some completion criteria unmet. Open the report to see what is missing.").length - 1).toBe(1);
    expect(view.html).toMatch(/data-tars-attention="tars-blocked"(?:(?!<\/li>).)*data-tars-open-report="search"/);
    expect(view.html.split("data-tars-open-report=").length - 1).toBe(1);
    view.press("Open report");
    expect(opened).toEqual([{ responsibilityId: "search", kind: "report", focus: { unmet: true } }]);
  });

  test("its report offers only the controls its state admits, through the tray's host path; Fleet stays beside them", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const search = f.responsibilities.find((row) => row.id === "search")!;
    const { actions, acted, fleet } = actionsRecording();
    const view = capture(() => TarsBlockedNextSteps({ row: search, decision: undefined, actions }));
    expect(view.labels).toEqual(["Resume", "Take over", "Cancel responsibility", "Open task", "Show in Fleet"]);
    view.press("Resume");
    view.press("Show in Fleet");
    expect(acted).toEqual(["resume"]);
    expect(fleet).toEqual([{ workspaceId: "exec-search", taskId: "task-search" }]);
    // An unverified completion answers through its decision card, never a bare Resume.
    const unverified = { ...search, detailCode: "unverifiedCompletion" as const };
    expect(capture(() => TarsBlockedNextSteps({ row: unverified, decision: undefined, actions })).labels).toEqual(["Open task", "Show in Fleet"]);
    // Work that is not blocked has no next steps here.
    expect(renderToStaticMarkup(createElement(TarsBlockedNextSteps, { row: { ...search, state: "running" }, decision: undefined, actions }))).toBe("");
  });

  test("flow nodes lead to the matching side-view section; a stuck stage shows why and opens the unmet criteria", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    expect(tarsFlowStageTarget("r", { id: "work", status: "completed", review: false })).toEqual({ responsibilityId: "r", kind: "timeline", focus: { stageId: "work" } });
    expect(tarsFlowStageTarget("r", { id: "review", status: "completed", review: true })).toEqual({ responsibilityId: "r", kind: "review" });
    expect(tarsFlowStageTarget("r", { id: "work", status: "stuck", review: false })).toEqual({ responsibilityId: "r", kind: "report", focus: { unmet: true } });
    const search = f.responsibilities.find((row) => row.id === "search")!;
    const flow = buildTarsFlow({ receipt: f.receipts[1]!, row: search, run: f.runs[search.agentRunId!] })!;
    const stuck = flow.progress!.stages.find((stage) => stage.id === "work")!;
    expect(stuck).toMatchObject({ status: "stuck", reason: "The benchmark needs the production dataset, which this workspace does not have." });
    const opened: string[] = [];
    const fleet: FleetFocusTarget[] = [];
    const view = capture(() => TarsFlowStageNode({ stage: stuck, target: flow.fleetTarget, onShowInFleet: (target) => fleet.push(target), onOpen: () => opened.push("unmet") }));
    expect(view.html).toContain("data-tars-flow-reason");
    expect(view.html).toContain("which this workspace does not have");
    // The node itself opens the side view; Fleet moved to its menu (the web e2e presses it).
    view.press(view.labels.find((label) => label.startsWith("Work"))!);
    expect(opened).toEqual(["unmet"]);
    expect(fleet).toEqual([]);
    expect(view.html).toContain("cannot continue: open the report&#x27;s unmet criteria");
    const review = buildTarsFlow({ receipt: f.receipts[0]!, row: f.responsibilities[0], run: f.runs["run-checkout"] })!.progress!.stages.find((stage) => stage.id === "review")!;
    expect(review.review).toBe(true);
  });
});

describe("tray outputs", () => {
  test("the indicator counts outputs only when there are some; needs you keeps its own count", async () => {
    await applyAppLocale("en");
    expect(describeTarsTrayCounts({ needsYou: 1, running: 0, waiting: 0, yours: 0, done: 1 }, "ready", 6)).toBe("1 needs you · 1 done · 6 outputs");
    expect(describeTarsTrayCounts({ needsYou: 1, running: 0, waiting: 0, yours: 0, done: 1 }, "ready", 0)).toBe("1 needs you · 1 done");
    await applyAppLocale("ko");
    expect(describeTarsTrayCounts({ needsYou: 0, running: 1, waiting: 0, yours: 0, done: 0 }, "ready", 2)).toBe("실행 1 · 산출물 2");
    await applyAppLocale("en");
  });

  test("each output opens its side-view kind; a recorded link opens where it points", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const outputs = buildTarsOutputs({ responsibilities: f.responsibilities, runs: f.runs });
    const opened: TarsSideViewTarget[] = [];
    const view = capture(() => TarsOutputList({ outputs, onOpenSide: (target) => opened.push(target) }));
    expect(view.html).toContain('href="https://example.com/acme/shop/pull/42"');
    view.press("Changes · 2 files");
    view.press("Review · passed");
    expect(opened).toEqual([{ responsibilityId: "checkout", kind: "changes" }, { responsibilityId: "checkout", kind: "review" }]);
    expect(renderToStaticMarkup(createElement(TarsOutputList, { outputs: [] }))).toContain("Nothing has been produced yet.");
  });
});

describe("side-view panels", () => {
  test("the report says when it was frozen, each criterion's status, and evidence by source and revision (ko)", async () => {
    await applyAppLocale("ko");
    const f = fixtures();
    const checkout = f.responsibilities[0]!;
    const html = renderToStaticMarkup(createElement(TarsReportPanel, { model: projectTarsReport(checkout, f.runs["run-checkout"]), row: checkout }));
    expect(html).toContain("실행이 끝난");
    expect(html).toContain("최종 리비전 9e2b7c11");
    expect(html).toContain("모든 기준을 충족했습니다.");
    expect(html).toContain("Verify 단계에서 에이전트가 보고 · 9e2b7c11에서 확인 · 최종 리비전");
    expect(html).toContain("Stave에서 검증함");
    expect(html).toContain("Work 단계에서 보고한 근거");
    await applyAppLocale("en");
  });

  test("evidence appears once, under its stage, never repeated under each criterion; a met criterion never says it has no evidence", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const checkout = f.responsibilities[0]!;
    const html = renderToStaticMarkup(createElement(TarsReportPanel, { model: projectTarsReport(checkout, f.runs["run-checkout"]), row: checkout }));
    // Two criteria, three stage groups: the Verify check appears once.
    expect(html.split("data-tars-criterion=").length - 1).toBe(2);
    expect(html.split("data-tars-evidence-group=").length - 1).toBe(3);
    expect(html.split("Evidence reported in Verify").length - 1).toBe(2); // heading text and its aria-label
    expect(html).not.toContain("No evidence was cited");
  });

  test("the report leads with how the run ended and why, then when it was taken, before its sections", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const search = f.responsibilities[1]!;
    const html = renderToStaticMarkup(createElement(TarsReportPanel, { model: projectTarsReport(search, f.runs["run-search"]), row: search }));
    const summary = html.slice(html.indexOf("data-tars-report-summary"), html.indexOf("data-tars-report-unmet"));
    const order = ["Run stopped", "data-tars-report-reason", "data-tars-report-frozen"].map((text) => summary.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Evidence sits in one raised panel like the criteria above it.
    expect(html).toMatch(/data-tars-evidence-group="[^"]+"(?:(?!<\/section>).)*<div class="[^"]*"><ul/);
  });

  test("only blocked work gets the blocked landmark and next steps", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const checkout = f.responsibilities[0]!;
    const plain = renderToStaticMarkup(createElement(TarsReportPanel, { model: projectTarsReport(checkout, f.runs["run-checkout"]), row: checkout }));
    expect(plain).not.toContain("data-tars-report-blocked");
    const search = f.responsibilities[1]!;
    const blocked = renderToStaticMarkup(createElement(TarsReportPanel, { model: projectTarsReport(search, f.runs["run-search"]), row: search,
      actions: createElement("span", null, "next") }));
    expect(blocked).toContain("data-tars-report-blocked");
  });

  test("a criterion's source line names a Stave check's result; a known check on an unknown final revision says so", async () => {
    await applyAppLocale("en");
    expect(describeTarsCriterionSource({ kind: "check", stageTitle: "Verify", name: "test", exitCode: 0, revision: "9e2b7c11", freshness: "current" }))
      .toBe("Stave check test passed in Verify · Checked on 9e2b7c11 · the final revision");
    expect(describeTarsCriterionSource({ kind: "check", stageTitle: "Verify", name: "test", exitCode: 2, revision: "9e2b7c11", freshness: "superseded" }))
      .toBe("Stave check test failed with exit code 2 in Verify · Checked on 9e2b7c11 · not the final revision");
    expect(describeTarsCriterionSource({ kind: "check", stageTitle: "Verify", name: "test", exitCode: null, revision: null, freshness: "unknown" }))
      .toBe("Stave check test has not run in Verify");
    expect(describeTarsEvidenceRevision("4f1c9a20", "finalUnknown")).toBe("Checked on 4f1c9a20 · final revision unknown");
  });

  test("the evidence list keeps its stale warning beside a revision line", async () => {
    await applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(EvidenceList, { evidence: [{ label: "Unit tests", kind: "check", source: "stave", freshness: "stale" }],
      revisions: ["Checked on 4f1c9a20 · not the final revision"] }));
    expect(html).toContain("data-evidence-revision");
    expect(html).toContain("data-evidence-stale");
  });

  test("an empty selection that stays empty keeps the same state, so typing elsewhere does not re-render the diff", () => {
    const empty: never[] = [];
    expect(keepTarsDiffSelection(empty, [])).toBe(empty);
    const lines = [{ oldLine: null, newLine: 2, sign: "+" as const, text: "x" }];
    expect(keepTarsDiffSelection(empty, lines)).toBe(lines);
    expect(keepTarsDiffSelection(lines, [])).toEqual([]);
  });

  test("the review shows the verdict and the reviewer's findings in its own words", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const html = renderToStaticMarkup(createElement(TarsReviewPanel, { review: projectTarsReview(f.runs["run-checkout"]) }));
    expect(html).toContain("Review passed");
    expect(html).toContain("2 findings");
    expect(html).toContain("Rename savedId to preferredCardId");
    expect(renderToStaticMarkup(createElement(TarsReviewPanel, { review: null }))).toContain("No independent review has reported yet.");
  });

  test("a show the host admitted reads as one opened line under the reply, never as authority", async () => {
    await applyAppLocale("en");
    const f = fixtures();
    const message = { ...f.messages[0]!, id: "message-show" };
    const receipt = { ...f.receipts[0]!, messageId: "message-show", action: { kind: "show" as const, responsibilityId: "checkout", view: "changes" as const } };
    const html = renderToStaticMarkup(createElement(TarsConversationMessage, { message, receipts: [receipt], name: "Tars", busy: false, onCancel() {},
      titleOf: () => "Show the saved card first at checkout" }));
    expect(tarsRecordText(html)).toContain("Open the changes Show the saved card first at checkout View opened");
    expect(i18n.language).toBe("en");
  });
});
