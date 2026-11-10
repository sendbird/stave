import { describe, expect, test } from "bun:test";
import { tarsRecordText } from "./tars-record-text";
import { i18n, applyAppLocale } from "../src/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { mergeTarsMessage } from "../src/components/tars/use-tars-conversation";
import { TARS_MESSAGE_FAILURE_TEXT, type TarsMessage, type TarsActionReceipt } from "../src/lib/tars/conversation";

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
    expect(html).toContain("Work added");
    expect(html).not.toContain("Completed");
    expect(html).not.toContain("Cancel message");
  });
  test("failure remains visible and never promises automatic retry", () => {
    const html = render({ ...message, state: "failed", error: "Provider disconnected" });
    expect(html).toContain("Provider disconnected");
    expect(html).toContain("will not run again automatically");
    expect(html).toContain("Verify the fix");
  });
  test("a reply carries no author line; its side and accessible name say who wrote it", () => {
    const html = render({ ...message, state: "answered", reply: "The fix is queued.", decision: { reply: "The fix is queued.", actions: [] } });
    expect(html).toContain('aria-label="Reply from My representative"');
    expect(html).toContain('aria-label="Your message"');
    expect(html).not.toContain("data-tars-mark");
    expect(html).not.toContain(">My representative<");
  });
  test("the time is the clock beside the user's bubble, before it, as a button the keyboard can reach", () => {
    const html = render({ ...message, state: "answered", reply: "Done.", decision: { reply: "Done.", actions: [] } });
    expect(html).toMatch(/data-tars-message-time="edge"><button type="button"[^>]*><time dateTime="2026-11-05T00:00:00.000Z">\d{1,2}:\d{2}\s[AP]M<\/time><\/button><\/span><div[^>]*data-tars-user-bubble=""/);
    // No full date line under the bubble any more: the card behind the stamp gives it.
    expect(html).not.toContain("Nov 5, 2026");
    expect(html).not.toContain("data-tars-message-meta");
  });
  test("a message in progress shows its state where the reply will be, with one named cancel control", () => {
    const thinking = render({ ...message, state: "reasoning" });
    expect(thinking).toMatch(/data-tars-message-state="reasoning"[\s\S]*role="status"[\s\S]*Thinking/);
    expect(thinking).toMatch(/<button[^>]*aria-label="Cancel message"[^>]*data-tars-message-cancel=""/);
    expect(thinking).not.toMatch(/>Cancel message</);
    const queued = render(message);
    expect(queued).toContain('data-tars-message-state="queued"');
    expect(queued).toContain('aria-label="Cancel message"');
    const cancelled = render({ ...message, state: "cancelled", revision: 2 });
    expect(cancelled).toContain('data-tars-message-state="cancelled"');
    expect(cancelled).toContain(">Cancelled<");
    expect(cancelled).not.toContain("Cancel message");
  });
  test("files show as chips with their type and size, above the bubble, and the working-changes choice as one more chip", () => {
    const html = render({ ...message, state: "answered", reply: "Seen.", decision: { reply: "Seen.", actions: [] }, includeWorkingChanges: true,
      attachments: [{ kind: "image", name: "login-error.png", type: "image/png", size: 2048 }, { kind: "file", name: "deploy.yaml", type: "yaml", size: 300 }] });
    expect(html).toMatch(/data-tars-message-attachments=""[\s\S]*login-error\.png[\s\S]*2(\.0)? KB · PNG[\s\S]*deploy\.yaml[\s\S]*300 B · YAML/);
    expect(html.indexOf("data-tars-message-attachments")).toBeLessThan(html.indexOf(">Verify the fix<"));
    expect(html).toMatch(/data-tars-message-working-changes=""[\s\S]*Includes working changes/);
    // An attachment-only message has no empty bubble.
    const filesOnly = render({ ...message, text: "", state: "answered", reply: "Seen.", decision: { reply: "Seen.", actions: [] },
      attachments: [{ kind: "file", name: "notes.txt", type: "txt", size: 10 }] });
    expect(filesOnly).not.toContain("x1ghz6dp x126k92a");
    expect(filesOnly).toContain("notes.txt");
  });
  test("a failed message is a notice with its reason and one way on; an interruption is a warning", async () => {
    const html = renderToStaticMarkup(createElement(TarsConversationMessage, { message: { ...message, state: "failed", error: "Provider disconnected" },
      receipts: [], name: "Tars", busy: false, onCancel() {}, onResend() {} }));
    expect(html).toContain('data-tars-message-state="failed"');
    expect(html).toContain("Tars could not answer");
    expect(html).toContain("Edit and resend");
    expect(html).not.toContain('role="alert"');
    const interrupted = renderToStaticMarkup(createElement(TarsConversationMessage, {
      message: { ...message, state: "failed", error: TARS_MESSAGE_FAILURE_TEXT.interrupted, errorCode: "interrupted", attachments: [{ kind: "file", name: "a.txt", type: "txt", size: 1 }] },
      receipts: [], name: "Tars", busy: false, onCancel() {}, onResend() {} }));
    expect(interrupted).toContain('data-tone="warning"');
    expect(interrupted).toContain("The answer was interrupted");
    expect(interrupted).toContain("Attach its files again before sending.");
    // Without a resend handler (a follow-up Tars started), there is no action.
    expect(render({ ...message, state: "failed", error: "x" })).not.toContain("Edit and resend");
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
    expect(tarsRecordText(html)).toContain("Take over goal Taken over by you");
    expect(html).toContain("내가 할게");
  });
});
