import { describe, expect, test } from "bun:test";
import { i18n, applyAppLocale } from "../src/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { mergeTarsMessage } from "../src/components/tars/use-tars-conversation";
import type { TarsMessage, TarsActionReceipt } from "../src/lib/tars/conversation";

const message: TarsMessage = { id: "message", requestId: "request", text: "Verify the fix", providerId: "codex", model: "test-model", maxTurns: 30, revision: 1, state: "queued", reply: null, decision: null, error: null, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };
const receipt: TarsActionReceipt = { messageId: message.id, actionIndex: 0, requestHash: "a".repeat(64), action: { kind: "delegate", workspaceId: "ws", title: "Fix the regression", instruction: "Fix it", acceptanceCriteria: ["Reproduction passes"], priority: 50 }, status: "applied", responsibilityId: "responsibility", error: null, reason: null, revision: 2, createdAt: message.createdAt, updatedAt: message.updatedAt };
const render = (item: TarsMessage, receipts: TarsActionReceipt[] = []) => renderToStaticMarkup(createElement(TarsConversationMessage, { message: item, receipts, name: "My representative", busy: false, onCancel() {} }));

describe("persistent conversation UI", () => {
  test("an attachment-only delegation refusal uses the localized reason, not the diagnostic", async () => {
    try {
      for (const locale of ["en", "ko"] as const) {
        applyAppLocale(locale); await i18n.changeLanguage(locale);
        const html = render({ ...message, text: "", state: "answered", reply: "", decision: { reply: "", actions: [receipt.action] } },
          [{ ...receipt, status: "rejected", reason: "missingMandate", error: "host-only diagnostic" }]);
        expect(html).toContain(locale === "en" ? "Write what you want Tars to do" : "Tars에게 맡길 일을 글로 적어");
        expect(html).not.toContain("host-only diagnostic");
      }
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
  });

  test("pending messages can be cancelled, settled answers cannot", () => {
    expect(render(message)).toContain("Cancel message");
    const decision = { reply: "The work is queued", actions: [receipt.action] };
    const html = render({ ...message, state: "answered", decision, reply: decision.reply }, [receipt]);
    expect(html).toContain("My representative");
    expect(html).toContain("Accepted for execution");
    expect(html).not.toContain("Completed");
    expect(html).not.toContain("Cancel message");
  });
  test("failure remains visible and never promises automatic retry", () => {
    const html = render({ ...message, state: "failed", error: "Provider disconnected" });
    expect(html).toContain("Provider disconnected");
    expect(html).toContain("will not run again automatically");
    expect(html).toContain("Verify the fix");
  });
  test("an older acknowledgement cannot revive a cancelled message and duplicate acknowledgements stay one row", () => {
    const cancelled = { ...message, state: "cancelled" as const, revision: 3 };
    const conversation = { settings: null, activity: [], messages: [cancelled], receipts: [] };
    expect(mergeTarsMessage(conversation, message)).toBe(conversation);
    expect(mergeTarsMessage(conversation, cancelled).messages).toEqual([cancelled]);
  });
  test("a spoken control shows its operation under the message that asked for it", () => {
    const control = { kind: "control" as const, responsibilityId: "goal", expectedRevision: 2, operation: "takeover" as const };
    const decision = { reply: "It is yours now.", actions: [control] };
    const html = render({ ...message, text: "내가 할게", state: "answered", decision, reply: decision.reply },
      [{ ...receipt, action: control, responsibilityId: "goal" }]);
    expect(html).toContain("Take over goal");
    expect(html).toContain("내가 할게");
  });
});
