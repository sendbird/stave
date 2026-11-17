import { expect, test } from "bun:test";
import { tarsBatchOutcomeCounts } from "../src/lib/tars/batch-outcome";
import type { TarsBatchRecord } from "../src/lib/tars/batch";

const item = (action: "archive" | "delete" | "pause", status: TarsBatchRecord["items"][number]["status"]) => ({
  responsibilityId: crypto.randomUUID(), revision: 1, workspaceId: "workspace", name: "Work", repositoryPath: "/tmp/repository", bytes: null, reason: null, action, status,
});
test("mixed cleanup reports actual archives, permanent deletion, Restore and unknown dispatch separately", () => {
  expect(tarsBatchOutcomeCounts({ items: [item("archive", "applied"), item("delete", "applied"), item("archive", "restored"), item("delete", "skipped"), item("archive", "applying")] }))
    .toEqual({ applied: 2, archived: 1, deleted: 1, restored: 1, skipped: 1, uncertain: 1 });
});
test("requesting permanent deletion never makes an archive count as a deletion", () => {
  expect(tarsBatchOutcomeCounts({ items: [item("archive", "applied"), item("delete", "skipped")] }))
    .toEqual({ applied: 1, archived: 1, deleted: 0, restored: 0, skipped: 1, uncertain: 0 });
});
test("undone controls no longer count as applied controls", () => {
  expect(tarsBatchOutcomeCounts({ items: [item("pause", "restored"), item("pause", "applied")] }))
    .toEqual({ applied: 1, archived: 0, deleted: 0, restored: 1, skipped: 0, uncertain: 0 });
});
