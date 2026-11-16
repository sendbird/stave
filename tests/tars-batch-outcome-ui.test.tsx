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
