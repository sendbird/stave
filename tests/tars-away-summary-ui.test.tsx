import { describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsAwaySummaryCard } from "../src/components/tars/TarsAwaySummary";
import { TarsRecordOpenWorkContext } from "../src/components/tars/TarsRecord";
import { buildTarsAwaySummary, type TarsAwayLink } from "../src/lib/tars/away-summary";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import type { TarsSideViewTarget } from "../src/lib/tars/side-view";
import { buildTarsAwayFixtures } from "../src/dev/tars-preview/tars-away-fixtures";

const T0 = Date.parse("2026-11-05T09:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function summaryOf(korean: boolean) {
  const view = buildTarsAwayFixtures(new Date(T0), korean).at(T0 + 45 * 60_000);
  const conversation = { messages: view.messages, receipts: view.receipts, activity: view.activity, records: [], events: view.events, publications: view.publications };
  return buildTarsAwaySummary({ span: { since: at(0), until: at(45) }, conversation,
    decisions: projectTarsDecisions({ ...conversation, answers: [], responsibilities: view.responsibilities }),
    titleOf: (id) => view.responsibilities.find((row) => row.id === id)?.title })!;
}

/**
 * The buttons a card holds, by accessible name, so a test presses real
 * handlers without a DOM. The card's own function components are called while
 * a capture component renders, so their hooks run as in a render.
 */
function buttons(render: () => ReactNode) {
  const found: Array<{ label: string; onClick: () => void }> = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isValidElement(node)) return;
    const props = node.props as { children?: ReactNode; onClick?: () => void; "aria-label"?: string };
    if (props.onClick) { found.push({ label: props["aria-label"] ?? (typeof props.children === "string" ? props.children : ""), onClick: props.onClick }); return; }
    if (typeof node.type === "function") visit((node.type as (props: unknown) => ReactNode)(node.props));
    else visit(props.children);
  };
  function Capture() { visit(render()); return null; }
  renderToStaticMarkup(createElement(Capture));
  return found;
}

describe("Tars away summary card", () => {
  test("says each group's count in words, names the work and links each item to its report, timeline, decision or record", () => {
    const summary = summaryOf(false);
    const html = renderToStaticMarkup(createElement(TarsAwaySummaryCard, { summary, onOpenSide() {}, onGoTo() {}, onJump() {}, onDismiss() {} }));
    for (const text of ["While you were away", "1 decision is waiting for you", "2 pieces of work are blocked or failed", "4 pieces of work finished", "1 draft PR opened",
      "And 1 more", "Jump to first new item", "Dismiss", "Ended without finishing", "Blocked", "PR #128"]) expect(html).toContain(text);
    expect(html).toContain('data-tars-away-group="waiting"');
    expect(html.indexOf('data-tars-away-group="waiting"')).toBeLessThan(html.indexOf('data-tars-away-group="blocked"'));
    expect(html.indexOf('data-tars-away-group="blocked"')).toBeLessThan(html.indexOf('data-tars-away-group="finished"'));
    expect(html).toContain('aria-label="Open the result report for Add retries to the webhook sender"');
    expect(html).toContain('aria-label="Go to the decision for Verify the release candidate"');
    expect(html).toContain('aria-label="Open the run timeline for Move the export queue to the new worker"');
    expect(html).toContain('aria-label="Show Show the saved card first at checkout in the conversation"');
    // Outside the conversation a work chip is a plain value, never a control that does nothing.
    expect(html).not.toContain("data-tars-record-open");
    // It is a named region, so assistive technology can find it.
    expect(html).toMatch(/<section[^>]*aria-labelledby="[^"]+"[^>]*data-tars-away=""/);
  });

  test("its links open the side view or go to the conversation, its work chips open the work, and Dismiss and Jump call back", () => {
    const summary = summaryOf(false);
    const opened: TarsSideViewTarget[] = [];
    const went: TarsAwayLink[] = [];
    let jumped = 0;
    let dismissed = 0;
    const found = buttons(() => createElement(TarsAwaySummaryCard, { summary, onOpenSide: (target) => { opened.push(target); }, onGoTo: (link) => { went.push(link); },
      onJump: () => { jumped++; }, onDismiss: () => { dismissed++; } }));
    const press = (label: string) => found.find((button) => button.label === label)!.onClick();
    press("Open the result report for Add retries to the webhook sender");
    press("Open the result report for Fix the flaky upload test");
    press("Open the run timeline for Move the export queue to the new worker");
    expect(opened).toEqual([{ responsibilityId: "away-webhook", kind: "report" }, { responsibilityId: "away-upload", kind: "report", focus: { unmet: true } },
      { responsibilityId: "away-queue", kind: "timeline" }]);
    press("Go to the decision for Verify the release candidate");
    press("Show Show the saved card first at checkout in the conversation");
    expect(went).toEqual([{ kind: "decision", decisionId: "ask:away-message-ask:0" }, { kind: "publishRecord", requestId: "away-publish" }]);
    press("Dismiss");
    expect([jumped, dismissed]).toEqual([0, 1]);
    const workOpened: string[] = [];
    const inConversation = renderToStaticMarkup(createElement(TarsRecordOpenWorkContext, { value: (id: string) => workOpened.push(id) },
      createElement(TarsAwaySummaryCard, { summary, onGoTo() {}, onDismiss() {} })));
    expect(inConversation).toContain('data-tars-record-open="away-release"');
    // Without a side view there is no report or timeline link, and with nothing after the card no jump.
    expect(inConversation).not.toContain('data-tars-away-link="report"');
    expect(inConversation).toContain('data-tars-away-link="decision"');
    expect(inConversation).not.toContain("data-tars-away-jump");
  });

  test("reads in Korean", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    try {
      const html = renderToStaticMarkup(createElement(TarsAwaySummaryCard, { summary: summaryOf(true), onOpenSide() {}, onGoTo() {}, onJump() {}, onDismiss() {} }));
      for (const text of ["자리를 비운 사이", "결정을 기다리는 일 1건", "진행할 수 없거나 실패한 작업 2건", "끝난 작업 4건", "새로 열린 Draft PR 1건", "외 1건", "첫 새 항목으로 이동", "닫기",
        "결과 보고서 열기", "실행 기록 열기", "결정으로 이동", "대화에서 보기"]) expect(html).toContain(text);
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
  });
});
