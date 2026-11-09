import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { TarsConversation, TarsConversationMessage } from "../src/components/tars/TarsConversation";
import type { TarsConversationState } from "../src/components/tars/use-tars-conversation";
import { TarsTrayCard, type TarsTrayActions } from "../src/components/tars/TarsTray";
import { TarsReportPanel } from "../src/components/tars/TarsReportPanel";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import { buildTarsTray } from "../src/lib/tars/tray-model";
import { projectTarsReport } from "../src/lib/tars/report-model";
import { describeTarsWorkingChanges } from "../src/lib/tars/detail";
import type { TarsMessage } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";

const start = new Date("2026-11-05T00:00:00.000Z");
const COMMIT = "3fa9c1d2e4b5a6978877665544332211aabbccdd";
const SNAPSHOT = { kind: "snapshot" as const, commit: COMMIT, ref: "refs/stave/tars/message/0f1e2d3c4b5a6978" };
const noActions: TarsTrayActions = { busy: false, onAct() {}, onConfirm() {}, onOpenTask() {}, onShowInFleet() {} };
afterEach(() => applyAppLocale("en"));

const message: TarsMessage = { id: "message", requestId: "request", text: "Fix it on top of my edits", providerId: "codex", model: "test-model",
  maxTurns: 30, revision: 1, state: "queued", reply: null, decision: null, error: null, createdAt: start.toISOString(), updatedAt: start.toISOString() };

function composer() {
  const state = { conversation: { settings: null, messages: [], receipts: [], activity: [], records: [] }, error: null, busy: false, available: true,
    refresh: async () => {}, send: async () => null, configure: async () => null, cancel: async () => null } as unknown as TarsConversationState;
  return renderToStaticMarkup(createElement(TarsConversation, { state, name: "Tars", initialSettings: { providerId: "codex", model: "test-model", maxTurns: 30 } }));
}

function cardHtml(row: TarsResponsibility) {
  const f = buildTarsTrayFixtures(start);
  const rows = f.responsibilities.map((entry) => entry.id === row.id ? row : entry);
  const tray = buildTarsTray({ responsibilities: rows, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
  const card = Object.values(tray.lanes).flat().find((entry) => entry.row.id === row.id)!;
  return renderToStaticMarkup(createElement(TarsTrayCard, { card, actions: noActions }));
}

describe("include my working changes", () => {
  test("the composer offers the choice next to Send, off by default", () => {
    const html = composer();
    const toggle = html.indexOf("data-tars-working-changes-toggle");
    expect(toggle).toBeGreaterThan(-1);
    expect(html).toContain("Include my working changes");
    // A design-system switch, unchecked until the user turns it on.
    expect(html.slice(html.lastIndexOf("<", toggle), html.indexOf(">", toggle))).toMatch(/role="switch"[^>]*aria-checked="false"|aria-checked="false"[^>]*role="switch"/);
    // It sits in the composer's action row, just before Send.
    const send = html.indexOf('aria-label="Send"', toggle);
    expect(send).toBeGreaterThan(toggle);
  });

  test("Korean names the choice in the app's language", async () => {
    await applyAppLocale("ko");
    expect(composer()).toContain("작업 중인 변경 포함");
  });

  test("a message that included working changes says so; others and Tars's own messages do not", () => {
    const render = (item: TarsMessage) => renderToStaticMarkup(createElement(TarsConversationMessage, { message: item, receipts: [], name: "Tars", busy: false, onCancel() {} }));
    expect(render({ ...message, includeWorkingChanges: true })).toContain("Includes working changes");
    expect(render(message)).not.toContain("data-tars-message-working-changes");
    expect(render({ ...message, includeWorkingChanges: false })).not.toContain("data-tars-message-working-changes");
  });

  test("the tray card says the work starts from the user's working changes with the short commit, or that there were none", async () => {
    const billing = buildTarsTrayFixtures(start).responsibilities.find((row) => row.id === "billing")!;
    const snapshot = cardHtml({ ...billing, workingChanges: SNAPSHOT });
    expect(snapshot).toContain('data-tars-working-changes="snapshot"');
    expect(snapshot).toContain("From your working changes · 3fa9c1d");
    expect(snapshot).not.toContain(COMMIT);
    expect(cardHtml({ ...billing, workingChanges: { kind: "clean" } })).toContain("No working changes to include · from the branch");
    expect(cardHtml(billing)).not.toContain("data-tars-working-changes");
    await applyAppLocale("ko");
    expect(cardHtml({ ...billing, workingChanges: SNAPSHOT })).toContain("작업 중인 변경에서 시작 · 3fa9c1d");
    expect(describeTarsWorkingChanges({ workingChanges: { kind: "clean" } })).toBe("포함할 작업 중인 변경 없음 · 브랜치에서 시작");
  });

  test("the report says it too", () => {
    const f = buildTarsSideViewFixtures(start);
    const checkout = { ...f.responsibilities[0]!, workingChanges: SNAPSHOT };
    const html = renderToStaticMarkup(createElement(TarsReportPanel, { model: projectTarsReport(checkout, f.runs["run-checkout"]), row: checkout }));
    expect(html).toContain('data-tars-report-working-changes="snapshot"');
    expect(html).toContain("From your working changes · 3fa9c1d");
  });
});
