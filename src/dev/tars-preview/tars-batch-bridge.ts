import { TarsBatchInputSchema, TarsBatchRecordsSchema, tarsBatchContains, type TarsBatchRecord } from "@/lib/tars/batch";
import type { TarsBridgeApi, TarsSnapshot } from "@/lib/tars/types";

/** UI-only contract fixture; host eligibility is exercised separately with real stores. */
export function createPreviewBatchBridge(snapshot: TarsSnapshot, changed: () => void): Pick<TarsBridgeApi, "batch" | "batches"> {
  const key = "tars-preview-batches";
  const records = TarsBatchRecordsSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
  const save = () => { sessionStorage.setItem(key, JSON.stringify(records)); changed(); };
  return {
    batches: async () => structuredClone(records),
    batch: async raw => {
      const input = TarsBatchInputSchema.parse(raw);
      if (input.operation === "preview") {
        const existing = input.proposal && records.find(record => record.proposal?.messageId === input.proposal!.messageId && record.proposal?.actionIndex === input.proposal!.actionIndex);
        if (existing) return structuredClone(existing);
        const action = input.action;
        const record: TarsBatchRecord = { id: crypto.randomUUID(), action, ...(input.proposal ? { proposal: input.proposal } : {}), state: "proposed", createdAt: new Date().toISOString(),
          items: snapshot.responsibilities.filter(row => tarsBatchContains(action.scope, row)).map(row => {
            const reason = action.kind === "cleanup" && !["completed", "cancelled"].includes(row.state) ? "responsibilityRunning" : null;
            return { responsibilityId: row.id, revision: row.revision, workspaceId: row.executionWorkspaceId, name: row.title, repositoryPath: row.repositoryPath,
              bytes: 1048576, reason, action: action.kind === "cleanup" ? "archive" : action.operation, status: reason ? "skipped" : "included" };
          }) };
        records.push(record); save(); return structuredClone(record);
      }
      const record = records.find(row => row.id === input.id);
      if (!record) throw new Error("Unknown batch");
      for (const item of record.items) {
        if (input.operation === "confirm" && item.status === "included") item.status = "applied";
        if (input.operation === "restore" && item.status === "applied" && item.action === "archive") item.status = "restored";
      }
      record.state = input.operation === "restore" ? "restored" : "applied";
      save(); return structuredClone(record);
    },
  };
}
