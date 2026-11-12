import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { TarsActivityView } from "../src/components/tars/TarsActivityView";
import { TarsActionUndoContext } from "../src/components/tars/use-tars-action-undo";
import { TarsActionRecordSchema, type TarsConversation } from "../src/lib/tars/conversation";
import { type TarsResponsibility } from "../src/lib/tars/types";


const NOW = "2026-11-12T12:00:00.000Z";
afterEach(() => applyAppLocale("en"));
const conversation: TarsConversation = { settings: null, messages: [], receipts: [], activity: [], records: [TarsActionRecordSchema.parse({
  requestId: "pause", requestHash: "a".repeat(64), source: "automatic", action: { kind: "control", operation: "pause", responsibilityId: "work", expectedRevision: 1 },
  status: "applied", error: null, reason: null, revision: 1, createdAt: NOW, updatedAt: NOW, undo: { kind: "unstarted", afterRevision: 2, detail: null },
})] };

test.each(["en", "ko"] as const)("Activity exposes translated filters, visible time/origin/work and guarded Undo (%s)", async locale => {
  await applyAppLocale(locale);
  const html = renderToStaticMarkup(<TarsActionUndoContext value={{ undoAction: async () => ({ record: null, refusal: "stale" }) }}>
    <TarsActivityView conversation={conversation} responsibilities={[{ id: "work", title: "Search" } as TarsResponsibility]} onOpenWork={() => {}} />
  </TarsActionUndoContext>);
  for (const text of locale === "en" ? ["All", "Done by Tars", "Needs you", "Tars automatically", "Undo"] : ["전체", "Tars가 한 일", "내 확인 필요", "Tars 자동 실행", "되돌리기"]) expect(html).toContain(text);
  expect(html).toContain('dateTime="2026-11-12T12:00:00.000Z"');
  expect(html).toContain("Search");
  expect(html).not.toContain("shell:tars");
  expect(html).toContain(locale === "en" ? "Pause" : "일시 정지");
});
