import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "../src/i18n";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { TarsReceiptRow } from "../src/components/tars/TarsReceiptRow";
import { TarsDecisionCard } from "../src/components/tars/TarsDecisionCard";
import { TarsActionUndoContext } from "../src/components/tars/use-tars-action-undo";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import type { TarsActionReceipt } from "../src/lib/tars/conversation";
import { workspaceConversationFixture } from "./tars-workspace-ui-fixture";

afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });
const undoApi = { undoAction: async () => ({ record: null, refusal: null }) };

test.each(["en", "ko"] as const)("%s receipt names the workspace and todo once, with Undo and the established actor", async locale => {
  applyAppLocale(locale); await i18n.changeLanguage(locale);
  const conversation = workspaceConversationFixture(locale === "ko");
  const html = renderToStaticMarkup(createElement(TarsActionUndoContext.Provider, { value: undoApi },
    createElement(TarsConversationMessage, { message: conversation.messages[0]!, receipts: conversation.receipts, records: conversation.records,
      busy: false, name: "Tars", onCancel() {} })));
  expect(html).toContain(locale === "en" ? "Added a todo to Release:" : "릴리스에 할 일 추가:");
  expect(html.match(/data-tars-receipt-kind="workspace"/g)).toHaveLength(1);
  expect(html).toContain('data-tars-record-undo="workspace"'); expect(html).toContain(locale === "en" ? "Undo" : "되돌리기");
  expect(html).toContain('data-tars-record-actor="tars"'); expect(html).not.toContain("tars.workspaceAction.");
  // The existing workspace-picker label remains a string after adding the new namespace.
  expect(typeof i18n.t("shell:tars.workspace")).toBe("string");
});

test("settled workspace proposals keep their Undo receipt, and old records never invent an Undo", () => {
  const conversation = workspaceConversationFixture();
  const record = conversation.records[0]!;
  const html = renderToStaticMarkup(createElement(TarsActionUndoContext.Provider, { value: undoApi }, createElement(TarsReceiptRow,
    { receipt: conversation.receipts[0]!, record: { ...record, undo: undefined } })));
  expect(html).not.toContain("data-tars-record-undo");
  expect(html).toContain("Added a todo to source:");
});

test("held replacement shows the exact complete value before confirming, and summary rows stay bounded", () => {
  const conversation = workspaceConversationFixture();
  const notes = `First line\n${"Full replacement content. ".repeat(80)}\nLast line`;
  const receipt: TarsActionReceipt = { ...conversation.receipts[0]!, status: "proposed", action: { kind: "workspace", workspaceId: "source", operation: "replaceNotes", notes } };
  const message = { ...conversation.messages[0]!, decision: { reply: "Please confirm", actions: [receipt.action] }, reply: "Please confirm" };
  const decisions = projectTarsDecisions({ messages: [message], receipts: [receipt], records: [], activity: [], answers: [], responsibilities: [] });
  const card = renderToStaticMarkup(createElement(TarsDecisionCard, { decision: decisions[0]!, workspaceNameOf: () => "Release", onAnswer() {} }));
  expect(card).toContain("First line"); expect(card).toContain("Last line"); expect(card).toContain("Confirm edit");
  const row = renderToStaticMarkup(createElement(TarsReceiptRow, { receipt }));
  expect(row).toContain("…"); expect(row).not.toContain("Last line");
});
