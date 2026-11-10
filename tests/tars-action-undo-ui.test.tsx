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
