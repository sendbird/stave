import type { TarsBatchRecord } from "./batch";

/** Count observed effects, never infer success from the options the user requested. */
export function tarsBatchOutcomeCounts(record: Pick<TarsBatchRecord, "items">) {
  const counts = { applied: 0, archived: 0, deleted: 0, restored: 0, skipped: 0, uncertain: 0 };
  for (const item of record.items) {
    if (item.status === "applied") {
      counts.applied++;
      if (item.action === "archive") counts.archived++;
      if (item.action === "delete") counts.deleted++;
    } else if (item.status === "restored") counts.restored++;
    else if (item.status === "skipped") counts.skipped++;
    else if (item.status === "applying") counts.uncertain++;
  }
  return counts;
}
