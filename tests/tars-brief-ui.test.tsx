import { describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { TarsBriefPanel } from "../src/components/tars/TarsBriefPanel";
import { TarsSideView } from "../src/components/tars/TarsSideView";
import { TarsTrayCard, type TarsTrayActions } from "../src/components/tars/TarsTray";
import { TarsFlowNodes } from "../src/components/tars/TarsFlowBlock";
import { TarsRunMonitor } from "../src/components/tars/TarsRunMonitor";
import { acceptTarsBrief, type TarsBriefState } from "../src/components/tars/use-tars-brief";
import { buildTarsBriefFixtures } from "../src/dev/tars-preview/tars-brief-fixtures";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { buildTarsBrief, type TarsBrief } from "../src/lib/tars/brief";
import { buildTarsTray } from "../src/lib/tars/tray-model";
import { buildTarsFlow } from "../src/lib/tars/flow-model";
import { TARS_SIDE_VIEW_KINDS, type TarsSideViewTarget } from "../src/lib/tars/side-view";
import type { TarsResponsibility } from "../src/lib/tars/types";

const start = new Date("2026-11-05T00:00:00.000Z");

/** React escapes text this way in markup, so a text appears whole only if every character survived. */
function escaped(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

/** Queued work as the preview's queue holds it: no task, no run, no execution workspace; its texts from the brief fixtures. */
function queued(id: "queue-auth" | "queue-search" | "queue-docs", korean = false): TarsResponsibility {
  const base = buildTarsTrayFixtures(start).responsibilities[1]!;
  return { ...base, id, requestId: `request-${id}`, title: `Work ${id}`, state: "queued", taskId: null, agentRunId: null, executionWorkspaceId: null,
    branchName: undefined, acceptanceCriteria: ["Only staging changes.", "The previous key stays valid\nfor 24 hours."], ...buildTarsBriefFixtures(start, korean)[id] };
}

const ready = (brief: TarsBrief): TarsBriefState => ({ status: "ready", brief });

/** Renders through a capture component and collects pressable handlers, so a test can press them without a DOM. */
function capture(render: () => ReactNode) {
  const sink: { tree: ReactNode } = { tree: null };
  function Capture() { sink.tree = render(); return sink.tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  const handlers: Array<{ label: string; onClick: () => void }> = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as { children?: ReactNode; trailingActions?: ReactNode; onClick?: () => void; title?: string; "aria-label"?: string };
    const text = typeof props.children === "string" ? props.children : "";
    // A pressed button outside a DOM has no element to move focus from: hand it a stand-in.
    const event = { currentTarget: { closest: () => null } };
    if (props.onClick) handlers.push({ label: props["aria-label"] ?? props.title ?? text, onClick: () => (props.onClick as (value: unknown) => void)(event) });
    visit(props.children);
    // A run monitor's footer links (its request and timeline) arrive as a prop.
    visit(props.trailingActions);
  };
  visit(sink.tree);
  return { html, press: (label: string) => handlers.find((handler) => handler.label === label)!.onClick() };
}

describe("the request view", () => {
  test("shows the user's message and Tars's instruction apart and whole: line breaks, code and long lines, with every criterion", async () => {
    await applyAppLocale("en");
    const row = queued("queue-auth");
    const html = renderToStaticMarkup(createElement(TarsBriefPanel, { row, state: ready(buildTarsBrief(row)), onRetry() {} }));
    expect(html).toContain("Your message");
    expect(html).toContain("Tars&#x27;s instruction");
    expect(html).toContain("The run receives it together with your message.");
    // Both texts appear whole, newlines and the code block included, each in its own block.
    expect(html).toContain(`data-tars-brief-text="request">${escaped(row.request!.text)}</div>`);
    expect(html).toContain(`data-tars-brief-text="instruction-delegated">${escaped(row.delegatedInstruction!)}</div>`);
    expect(row.request!.text).toContain("```yaml\nauth:\n  signingKey:");
    expect(html).toContain("Sent ");
    expect(html).toContain("2 completion criteria");
    expect(html).toContain("The previous key stays valid\nfor 24 hours.");
    expect(html).not.toContain("data-tars-brief-missing");
    expect(html).toContain('aria-label="Copy your message"');
    expect(html).toContain('aria-label="Copy the instruction"');
  });

  test("names the question a choice answered", async () => {
    await applyAppLocale("en");
    const row = queued("queue-search");
    const html = renderToStaticMarkup(createElement(TarsBriefPanel, { row, state: ready(buildTarsBrief(row)), onRetry() {} }));
    expect(html).toContain("your choice on Tars&#x27;s question: How many times should the webhook sender retry a failed delivery?");
    expect(html).toContain(">Retry three times, then give up</div>");
  });

  test("says plainly when older work has no saved message, and shows its whole saved instruction and attached text", async () => {
    await applyAppLocale("en");
    const row = { ...queued("queue-docs"), mandate: "The complete attached text.\nSecond line." };
    const html = renderToStaticMarkup(createElement(TarsBriefPanel, { row, state: ready(buildTarsBrief(row)), onRetry() {} }));
    expect(html).toContain('data-tars-brief-missing="request"');
    expect(html).toContain("The original message was not saved for this work");
    expect(html).toContain("Instruction as saved");
    expect(html).toContain(`data-tars-brief-text="instruction-assignment">${escaped(row.instruction)}</div>`);
    expect(html).toContain("Attached in full");
    expect(html).toContain("The complete attached text.\nSecond line.");
    expect(html).not.toContain("Tars&#x27;s instruction<");
  });

  test("keeps the criteria in view while loading, after a failed read (with Retry) and on a bridge that cannot read", async () => {
    await applyAppLocale("en");
    const row = queued("queue-auth");
    let retried = 0;
    const failed = capture(() => TarsBriefPanel({ row, state: { status: "failed" }, onRetry: () => { retried++; } }));
    expect(failed.html).toContain('role="alert"');
    expect(failed.html).toContain("The saved request could not be loaded.");
    expect(failed.html).toContain("Only staging changes.");
    failed.press("Retry");
    expect(retried).toBe(1);
    for (const [status, words] of [["loading", "Loading the saved request…"], ["unavailable", "This version of Stave cannot read the saved request."]] as const) {
      const html = renderToStaticMarkup(createElement(TarsBriefPanel, { row, state: { status }, onRetry() {} }));
      expect(html).toContain(words);
      expect(html).toContain("Only staging changes.");
      expect(html).not.toContain("data-tars-brief-text");
    }
  });

  test("reads in Korean", async () => {
    await applyAppLocale("ko");
    const row = queued("queue-docs", true);
    const html = renderToStaticMarkup(createElement(TarsBriefPanel, { row, state: ready(buildTarsBrief(row)), onRetry() {} }));
    expect(html).toContain("보낸 메시지 원문");
    expect(html).toContain("원문이 저장되어 있지 않습니다");
    expect(html).toContain("저장된 실행 지시");
    expect(html).toContain("완료 기준 2개");
    await applyAppLocale("en");
  });

  test("never shows a brief that names other work", () => {
    const row = queued("queue-auth");
    const other = buildTarsBrief(queued("queue-search"));
    expect(acceptTarsBrief(row.id, other)).toEqual({ status: "failed" });
    expect(acceptTarsBrief(other.responsibilityId, other)).toEqual({ status: "ready", brief: other });
  });
});

describe("where the request view opens", () => {
  test("the side view lists Request first and opens it for queued work", async () => {
    await applyAppLocale("en");
    expect(TARS_SIDE_VIEW_KINDS[0]).toBe("brief");
    const row = queued("queue-auth");
    const html = renderToStaticMarkup(createElement(TarsSideView, { target: { responsibilityId: row.id, kind: "brief" }, row, run: undefined,
      placement: { placement: "column" }, records: [], cwd: null, takeFocus: false, onKind() {}, onClose() {}, onQuote() {},
      loadBrief: async () => buildTarsBrief(row) }));
    expect(html).toContain('data-tars-side-view="brief"');
    expect(html).toContain("Request and instruction");
    // The read starts once mounted; the static render shows the loading line and the criteria from the snapshot.
    expect(html).toContain('data-tars-brief="loading"');
    expect(html).toContain("Only staging changes.");
  });

  test("a queued card, without a task or run, opens its request; so does every other card", async () => {
    await applyAppLocale("en");
    const fixtures = buildTarsTrayFixtures(start);
    const row = queued("queue-auth");
    const tray = buildTarsTray({ responsibilities: [...fixtures.responsibilities, row], attentionItems: [], runs: fixtures.runs });
    const cards = Object.values(tray.lanes).flat();
    const opened: TarsSideViewTarget[] = [];
    const actions: TarsTrayActions = { busy: false, onAct() {}, onConfirm() {}, onOpenTask() {}, onShowInFleet() {}, onOpenSide: (target) => opened.push(target) };
    const card = cards.find((entry) => entry.row.id === row.id)!;
    expect(card.queue).not.toBeNull();
    expect(renderToStaticMarkup(createElement(TarsTrayCard, { card, actions }))).toContain(`data-tars-monitor-brief="${row.id}"`);
    const view = capture(() => TarsRunMonitor({ row, onOpenSide: actions.onOpenSide }));
    view.press(`Open the request and instruction for ${row.title}`);
    expect(opened).toEqual([{ responsibilityId: row.id, kind: "brief" }]);
    for (const other of cards) expect(renderToStaticMarkup(createElement(TarsTrayCard, { card: other, actions }))).toContain(`data-tars-monitor-brief="${other.row.id}"`);
    // Without a side view (Fleet's own surfaces) there is nothing to open.
    expect(renderToStaticMarkup(createElement(TarsTrayCard, { card, actions: { ...actions, onOpenSide: undefined } }))).not.toContain("data-tars-monitor-brief");
  });

  test("the conversation's Request node opens the request", async () => {
    await applyAppLocale("en");
    const fixtures = buildTarsTrayFixtures(start);
    const billing = fixtures.responsibilities.find((row) => row.id === "billing")!;
    const flow = buildTarsFlow({ receipt: fixtures.receipt, row: billing, run: fixtures.runs[billing.agentRunId!] })!;
    const opened: TarsSideViewTarget[] = [];
    const view = capture(() => TarsFlowNodes({ flow, onOpenSide: (target) => opened.push(target) }));
    expect(view.html).toContain("data-tars-flow-request");
    view.press("Open the request and Tars's instruction");
    expect(opened).toEqual([{ responsibilityId: "billing", kind: "brief" }]);
  });
});
