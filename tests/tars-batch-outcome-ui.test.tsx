import { beforeEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../src/i18n";
import { TarsBatchCard } from "../src/components/tars/TarsBatchCard";
import type { TarsBatchRecord } from "../src/lib/tars/batch";

beforeEach(async () => { await i18n.changeLanguage("en"); });
const item = (action: "archive" | "delete", status: TarsBatchRecord["items"][number]["status"]): TarsBatchRecord["items"][number] => ({
  responsibilityId: crypto.randomUUID(), revision: 1, workspaceId: "workspace", name: "Work", repositoryPath: "/tmp/repository", bytes: null, reason: null, action, status,
});
function render(items: TarsBatchRecord["items"], state: TarsBatchRecord["state"] = "applied") {
  const record: TarsBatchRecord = { id: "batch", action: { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: true }, state, items, createdAt: "2026-11-17T00:00:00.000Z" };
  return renderToStaticMarkup(<TarsBatchCard record={record} busy={false} onConfirm={() => {}} onRestore={() => {}} onDecline={() => {}} />);
}
test("a permanent-delete request that only archived work reports an archive", () => {
  const html = render([item("archive", "applied"), item("delete", "skipped")]);
  expect(html).toContain("Archived 1");
  expect(html).not.toContain("Permanently deleted");
});
test("restoring archives never claims the permanent deletion was undone", () => {
  const html = render([item("archive", "restored"), item("delete", "applied")], "restored");
  expect(html).toContain("Restored 1");
  expect(html).toContain("Permanently deleted 1");
});
test("an uncertain dispatched item remains explicit in the record summary", () => {
  expect(render([item("archive", "applying")])).toContain("Inspect outcome 1");
});
test("a batch still executing shows progress and no buttons", () => {
  const html = render([item("archive", "applied"), item("archive", "included")], "executing");
  expect(html).not.toContain("data-tars-batch-confirm");
  expect(html).not.toContain("data-tars-batch-decline");
  expect(html).not.toContain("<button");
  expect(html).toContain("aria-busy=\"true\"");
});
test("an interrupted batch says what ran and offers Continue for the remainder only", () => {
  const html = render([item("archive", "applied"), item("archive", "included")], "interrupted");
  expect(html).toContain("Archived 1");
  expect(html).toContain("data-tars-batch-continue");
  expect(html).toContain("Continue");
  expect(html).not.toContain("data-tars-batch-confirm");
});
test("a restore whose branch was deleted says Restored read-only", () => {
  expect(render([{ ...item("archive", "restored"), readOnly: true }], "restored")).toContain("Restored read-only");
});
test("sizes use the app byte format and the card is a named region", () => {
  const html = render([{ ...item("archive", "included"), bytes: 1048576 }], "proposed");
  expect(html).toContain("1.0 MB");
  expect(html).not.toContain(" B<");
  const labelled = html.match(/<section[^>]*role="region"[^>]*aria-labelledby="([^"]+)"/);
  expect(labelled).not.toBeNull();
  expect(html).toMatch(new RegExp(`id="${labelled![1]}"[^>]*>[^<]+ · 1 included`));
});
test("unavailable pull request status is one reason line, not per-item noise", () => {
  const skipped = { ...item("archive", "skipped"), reason: "prStatusUnavailable" };
  const html = render([skipped, { ...skipped, responsibilityId: "b" }, { ...skipped, responsibilityId: "c" }], "proposed");
  expect(html.split("Pull request status unavailable").length - 1).toBe(1);
  expect(html).toContain("sign in to GitHub CLI or use the cleanup center");
});
test("ended work left out of a bulk control is one count line", () => {
  const record: TarsBatchRecord = { id: "batch", action: { kind: "bulkControl", operation: "pause", scope: { kind: "all" } }, state: "proposed", items: [], omitted: 2, createdAt: "2026-11-17T00:00:00.000Z" };
  expect(renderToStaticMarkup(<TarsBatchCard record={record} busy={false} onConfirm={() => {}} onRestore={() => {}} onDecline={() => {}} />)).toContain("2 ended items left out");
});
