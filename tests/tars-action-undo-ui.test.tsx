import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "../src/i18n";
import type { TarsActionRecord } from "../src/lib/tars/conversation";
import { TarsActionRecordLine } from "../src/components/tars/TarsActionRecordLine";
import { TarsActionUndoContext } from "../src/components/tars/use-tars-action-undo";

const at = "2026-11-10T00:00:00.000Z";
const record: TarsActionRecord = { requestId: "move", requestHash: "d".repeat(64), source: "drag", action: { kind: "move", responsibilityId: "work", expectedRevision: 1,
  move: { direction: "later" } }, status: "applied", reason: null, error: null, revision: 2, createdAt: at, updatedAt: at,
  undo: { kind: "queue", priorities: [{ id: "work", before: 50, afterRevision: 2 }], queue: [{ id: "work", revision: 2 }] } };
function render(row: TarsActionRecord, available = true) {
  return renderToStaticMarkup(createElement(TarsActionUndoContext.Provider, { value: available ? {
    undoAction: async () => { throw new Error("Rendering must not mutate work"); },
  } : {} }, createElement(TarsActionRecordLine, { record: row, title: "Work" })));
}

test("supported records expose translated Undo and the completed receipt reads Undone", () => {
  try {
    for (const [lang, action, done] of [["en", "Undo", "Undone"], ["ko", "되돌리기", "되돌림"]] as const) {
      applyAppLocale(lang);
      const html = render(record);
      expect(html).toContain("data-tars-record-undo"); expect(html).toContain(action);
      const completed = render({ ...record, undo: { ...record.undo!, undoneAt: at } });
      expect(completed).toContain(done); expect(completed).not.toContain("data-tars-record-undo");
    }
  } finally { applyAppLocale("en"); }
});

test("historical records, irreversible controls and hosts without the capability expose no misleading Undo", () => {
  const { undo: _undo, ...historical } = record;
  expect(render(historical)).not.toContain("data-tars-record-undo");
  expect(render({ ...historical, source: "click", action: { kind: "control", responsibilityId: "work", expectedRevision: 1, operation: "startNow" } })).not.toContain("data-tars-record-undo");
  expect(render(record, false)).not.toContain("data-tars-record-undo");
});

test("pending message records reuse Undo as request-local withdrawal in both languages", () => {
  const delivery: TarsActionRecord = { ...record, requestId: "follow-up", source: "click", undo: { kind: "delivery" },
    action: { kind: "control", responsibilityId: "work", expectedRevision: 1, operation: "message", input: { text: "Correct the result" } },
    delivery: { status: "queued", agentRunId: "completed-run", reason: null, error: null, queuedAt: at, updatedAt: at } };
  try {
    for (const [lang, action, done, checking] of [["en", "Withdraw request", "Request withdrawn", "Checking withdrawal"],
      ["ko", "요청 철회", "요청 철회됨", "철회 여부를 확인"]] as const) {
      applyAppLocale(lang);
      expect(render(delivery)).toContain(action);
      const held = render({ ...delivery, delivery: { ...delivery.delivery!, withdrawRequestedAt: at } });
      expect(held).toContain(checking); expect(held).not.toContain(done);
      const withdrawn = render({ ...delivery, undo: { kind: "delivery", undoneAt: at }, delivery: { ...delivery.delivery!, status: "withdrawn" } });
      expect(withdrawn).toContain(done); expect(withdrawn).not.toContain("data-tars-record-undo");
      expect(render({ ...delivery, delivery: { ...delivery.delivery!, status: "delivered" } })).not.toContain("data-tars-record-undo");
    }
  } finally { applyAppLocale("en"); }
});

test("an answered decision keeps withdrawal on the same delivery record", async () => {
  const { TarsDecisionCard } = await import("../src/components/tars/TarsDecisionCard");
  const saved: TarsActionRecord = { ...record, requestId: "decision-request", source: "click", undo: { kind: "delivery" },
    action: { kind: "control", responsibilityId: "work", expectedRevision: 1, operation: "message", input: { text: "Correct the result" } },
    delivery: { status: "queued", agentRunId: "completed-run", reason: null, error: null, queuedAt: at, updatedAt: at } };
  const decision: import("../src/lib/tars/decisions").TarsDecisionView = { id: "confirm:message:0", kind: "confirm", messageId: "message", actionIndex: 0,
    question: null, targets: [{ responsibilityId: "work", expectedRevision: 1 }], options: [{ kind: "control", label: "Send to task", rationale: null,
      control: { responsibilityId: "work", expectedRevision: 1, operation: "message", input: { text: "Correct the result" } } }], recommended: 0,
    state: "answered", why: null, checked: true, answer: { decisionId: "confirm:message:0", optionIndex: 0, source: "click",
      effect: { kind: "control", responsibilityId: "work", expectedRevision: 1, operation: "message", input: { text: "Correct the result" } },
      label: "Send to task", status: "applied", reason: null, error: null, actRequestId: saved.requestId, messageId: null, revision: 2, createdAt: at, updatedAt: at },
    failure: null, latest: true, record: null, delivery: saved.delivery!, deliveryRecord: saved, since: at, reask: false, reasked: false };
  const html = renderToStaticMarkup(createElement(TarsActionUndoContext.Provider, { value: { undoAction: async () => ({ record: saved, refusal: null }) } },
    createElement(TarsDecisionCard, { decision, onAnswer: () => {}, titleOf: () => "Existing work" })));
  expect(html).toContain('data-tars-record-undo="delivery"'); expect(html).toContain("Withdraw request");
});
