import { TarsBatchInputSchema, TarsBatchRecordsSchema, tarsBatchContains, type TarsBatchRecord } from "@/lib/tars/batch";
import type { TarsBridgeApi, TarsSnapshot } from "@/lib/tars/types";

const ENDED = new Set(["completed", "cancelled"]);

/** UI-only contract fixture; host eligibility is exercised separately with real stores. */
export function createPreviewBatchBridge(snapshot: TarsSnapshot, changed: () => void, options: { failOnce?: boolean; missingWorkspace?: boolean } = {}): Pick<TarsBridgeApi, "batch" | "batches"> {
  let failed = false;
  const key = "tars-preview-batches";
  let records = TarsBatchRecordsSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
  const save = () => { sessionStorage.setItem(key, JSON.stringify(records)); changed(); };
  return {
    batches: async () => structuredClone(records),
    batch: async raw => {
      const input = TarsBatchInputSchema.parse(raw);
      if (input.operation === "preview") {
        const existing = input.proposal && records.find(record => record.proposal?.messageId === input.proposal!.messageId && record.proposal?.actionIndex === input.proposal!.actionIndex);
        if (existing) return structuredClone(existing);
        const action = input.action;
        // As the host does: list only what the operation can act on, and count ended (or unfinished) work once.
        const inScope = snapshot.responsibilities.filter(row => tarsBatchContains(action.scope, row));
        const rows = inScope.filter(row => action.kind === "cleanup" ? ENDED.has(row.state) : !ENDED.has(row.state));
        const omitted = inScope.length - rows.length;
        const open = input.proposal ? undefined : records.find(record => !record.proposal && record.state === "proposed" && JSON.stringify(record.action) === JSON.stringify(action));
        const record: TarsBatchRecord = { id: open?.id ?? crypto.randomUUID(), action, ...(input.proposal ? { proposal: input.proposal } : {}), state: "proposed", createdAt: new Date().toISOString(),
          ...(omitted ? { omitted } : {}),
          items: rows.map(row => ({ responsibilityId: row.id, revision: row.revision, workspaceId: row.executionWorkspaceId, name: row.title, repositoryPath: row.repositoryPath,
            bytes: action.kind === "cleanup" ? 1048576 : null, reason: options.missingWorkspace ? "workspaceMissing" : null, action: action.kind === "cleanup" ? "archive" : action.operation, status: options.missingWorkspace ? "skipped" : "included" })) };
        records = [...records.filter(row => row.id !== record.id), record]; save(); return structuredClone(record);
      }
      if (input.operation === "confirm" && options.failOnce && !failed) { failed = true; throw new Error("Fixture transport failure"); }
      const record = records.find(row => row.id === input.id);
      if (!record) throw new Error("Unknown batch");
      if (input.operation === "decline") {
        if (record.state !== "proposed") return structuredClone(record);
        if (!record.proposal) { records = records.filter(row => row.id !== record.id); save(); return { ...structuredClone(record), state: "declined" }; }
        record.state = "declined"; save(); return structuredClone(record);
      }
      for (const item of record.items) {
        if (input.operation === "confirm" && item.status === "included") item.status = "applied";
        if (input.operation === "restore" && item.status === "applied" && item.action === "archive") item.status = "restored";
      }
      record.state = input.operation === "restore" ? "restored" : "applied";
      save(); return structuredClone(record);
    },
  };
}
