import { canUndoTarsAction } from "../../src/lib/tars/action-undo";
import { randomUUID } from "node:crypto";
import { TarsBatchInputSchema, TarsBatchRecordsSchema, tarsBatchContains, type TarsBatchRecord } from "../../src/lib/tars/batch";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import { admitTarsControl } from "./tars-control";
import type { TarsActInput, TarsActResult } from "../../src/lib/tars/conversation";
import type { createWorkspaceCleanupRuntime } from "./workspace-cleanup-runtime";
import { fetchGitHubPrStatus } from "./scm-runtime";

export function createTarsBatchRuntime(ports: {
  conversations: () => TarsConversationStore;
  responsibilities: () => TarsStore;
  cleanup: Pick<ReturnType<typeof createWorkspaceCleanupRuntime>, "list" | "act">;
  control: (input: TarsActInput) => Promise<TarsActResult>;
  undo?: (requestId: string, expectedRevision: number) => Promise<{ refusal: string | null }>;
  pr?: typeof fetchGitHubPrStatus;
}) {
  let chain = Promise.resolve();
  const records = () => TarsBatchRecordsSchema.parse(ports.conversations().readBatchRecords());
  const save = (record: TarsBatchRecord) => {
    const all = records();
    ports.conversations().writeBatchRecords([...all.filter(row => row.id !== record.id), record]);
    return record;
  };
  const settle = (record: TarsBatchRecord) => {
    if (record.proposal && ["applied", "restored"].includes(record.state)) ports.conversations().settleBatchProposal(record.proposal.messageId, record.proposal.actionIndex, new Date().toISOString());
    return record;
  };
  const proposalAllowed = (record: Pick<TarsBatchRecord, "proposal" | "action">) => {
    if (!record.proposal) return;
    const message = ports.conversations().get(record.proposal.messageId);
    const receipt = ports.conversations().getReceipt(record.proposal.messageId, record.proposal.actionIndex);
    if (!message || message.origin?.kind === "followUp" || message.origin?.kind === "reask" || receipt?.status !== "proposed" || JSON.stringify(receipt.action) !== JSON.stringify(record.action))
      throw new Error("This batch needs a current user proposal.");
  };
  async function perform(raw: unknown): Promise<TarsBatchRecord> {
    const input = TarsBatchInputSchema.parse(raw);
    if (input.operation === "preview") {
      const existing = input.proposal && records().find(row => row.proposal?.messageId === input.proposal!.messageId && row.proposal?.actionIndex === input.proposal!.actionIndex);
      if (existing) return settle(existing);
      proposalAllowed(input);
      const action = input.action;
      const rows = ports.responsibilities().snapshot().responsibilities.filter(row => tarsBatchContains(action.scope, row));
      if (rows.length > 1000) throw new Error("Narrow the scope to at most 1000 responsibilities.");
      const cleanup = action.kind === "cleanup" ? await ports.cleanup.list(true, true) : null;
      const items: TarsBatchRecord["items"] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const workspace = cleanup?.rows.find(item => item.id === row.executionWorkspaceId && item.repositoryPath === row.repositoryPath);
        let reason: string | null = null;
        if (action.kind === "cleanup") {
          if (!["completed", "cancelled"].includes(row.state)) reason = "responsibilityRunning";
          else if (!workspace || workspace.branchOnly) reason = "ownershipChanged";
          else if (seen.has(workspace.id)) reason = "duplicateWorkspace";
          else if (workspace.blockers.length) reason = workspace.blockers.join(",");
          else if (workspace.archived && !action.permanentlyDeleteArchived) reason = "alreadyArchived";
          else if (action.deleteBranches && !workspace.branchDeletable) reason = "unmergedBranch";
          if (!reason && workspace) {
            const pr = await (ports.pr ?? fetchGitHubPrStatus)({ cwd: row.repositoryPath, target: workspace.branch });
            if (!pr.ok || pr.pr?.state === "OPEN") reason = pr.ok ? "publicationPending" : "checksUnavailable";
          }
          if (workspace) seen.add(workspace.id);
        } else {
          try { admitTarsControl(row, { responsibilityId: row.id, expectedRevision: row.revision, operation: action.operation }); }
          catch (error) { reason = error instanceof Error && "reason" in error ? String(error.reason) : "unknown"; }
        }
        items.push({ responsibilityId: row.id, revision: row.revision, workspaceId: row.executionWorkspaceId,
          name: row.title, repositoryPath: row.repositoryPath, bytes: workspace?.bytes ?? null, reason,
          action: action.kind === "bulkControl" ? action.operation : workspace?.archived ? "delete" : "archive", status: reason ? "skipped" : "included" });
      }
      return save({ id: randomUUID(), action, ...(input.proposal ? { proposal: input.proposal } : {}), state: "proposed", items, createdAt: new Date().toISOString() });
    }
    const record = records().find(row => row.id === input.id);
    if (!record) throw new Error("The batch was not found.");
    if (input.operation === "restore") {
      if (record.state !== "applied") return record;
      const reversible = record.items.filter(item => item.status === "applied" && (item.action === "archive" || item.undoable));
      if (!reversible.length) return record;
      for (const item of reversible) {
        if (item.undoable) {
          const previous = ports.conversations().getAction(`batch:${record.id}:${item.responsibilityId}`);
          const result = previous?.undo?.undoneAt ? { refusal: null } : previous && ports.undo ? await ports.undo(previous.requestId, previous.revision) : { refusal: "unsupported" };
          if (!result.refusal) item.status = "restored"; else item.reason = result.refusal;
          save(record); continue;
        }
        const result = await ports.cleanup.act({ action: "restore", workspaceId: item.workspaceId!, repositoryPath: item.repositoryPath });
        if (result.ok) item.status = "restored"; else item.reason = result.reason;
        save(record);
      }
      if (!record.items.some(item => item.status === "applied" && (item.action === "archive" || item.undoable))) record.state = "restored";
      return save(record);
    }
    if (record.state === "applied" || record.state === "restored") return settle(record);
    proposalAllowed(record);
    record.state = "executing";
    save(record);
    for (const item of record.items) {
      if (item.status !== "included") continue;
      const previous = record.action.kind === "bulkControl" ? ports.conversations().getAction(`batch:${record.id}:${item.responsibilityId}`) : null;
      if (previous && previous.status !== "pending") {
        item.status = previous.status === "applied" ? "applied" : "skipped";
        item.reason = previous.reason; item.undoable = canUndoTarsAction(previous); save(record); continue;
      }
      const row = ports.responsibilities().get(item.responsibilityId);
      if (!row || row.revision !== item.revision || row.executionWorkspaceId !== item.workspaceId) {
        item.status = "skipped"; item.reason = "stale"; save(record); continue;
      }
      if (record.action.kind === "bulkControl") {
        const result = await ports.control({ requestId: `batch:${record.id}:${item.responsibilityId}`, responsibilityId: row.id, expectedRevision: item.revision, operation: record.action.operation, source: "click" });
        item.status = result.record.status === "applied" ? "applied" : "skipped";
        item.reason = result.record.reason; item.undoable = canUndoTarsAction(result.record);
      } else {
        const fresh = (await ports.cleanup.list(false, true)).rows.find(workspace => workspace.id === item.workspaceId && workspace.repositoryPath === item.repositoryPath);
        if (!fresh || fresh.blockers.length || !["completed", "cancelled"].includes(row.state)) {
          item.status = "skipped"; item.reason = fresh?.blockers.join(",") || "ownershipChanged"; save(record); continue;
        }
        if (item.action === "delete" && !fresh.archived || item.action === "archive" && fresh.archived) {
          item.status = "skipped"; item.reason = fresh.archived ? "alreadyArchived" : "notArchived"; save(record); continue;
        }
        const pr = await (ports.pr ?? fetchGitHubPrStatus)({ cwd: item.repositoryPath, target: fresh.branch });
        if (!pr.ok || pr.pr?.state === "OPEN") {
          item.status = "skipped"; item.reason = pr.ok ? "publicationPending" : "checksUnavailable"; save(record); continue;
        }
        // Persist dispatch before destructive I/O. An interrupted item is never replayed automatically.
        item.status = "applying"; save(record);
        const result = await ports.cleanup.act({ action: item.action === "delete" ? "delete" : "archive", workspaceId: item.workspaceId!, repositoryPath: item.repositoryPath, deleteBranch: record.action.deleteBranches, archivedOnly: item.action === "delete" });
        item.status = result.ok ? "applied" : "skipped"; item.reason = result.reason;
        if (!result.ok && item.action === "archive") {
          const after = (await ports.cleanup.list()).rows.find(workspace => workspace.id === item.workspaceId && workspace.repositoryPath === item.repositoryPath);
          if (after?.archived) item.status = "applied";
        }
      }
      save(record);
    }
    record.state = "applied";
    save(record);
    if (record.proposal) ports.conversations().settleBatchProposal(record.proposal.messageId, record.proposal.actionIndex, new Date().toISOString());
    return record;
  }
  return { list: records, invoke(raw: unknown) {
    const next = chain.then(() => perform(raw));
    chain = next.then(() => {}, () => {});
    return next;
  } };
}
