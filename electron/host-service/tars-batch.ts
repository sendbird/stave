import { canUndoTarsAction } from "../../src/lib/tars/action-undo";
import { randomUUID } from "node:crypto";
import { TarsBatchInputSchema, TarsBatchRecordSchema, tarsBatchContains, type TarsBatchAction, type TarsBatchRecord } from "../../src/lib/tars/batch";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import { admitTarsControl } from "./tars-control";
import type { TarsActInput, TarsActResult } from "../../src/lib/tars/conversation";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { createWorkspaceCleanupRuntime } from "./workspace-cleanup-runtime";
import { fetchGitHubPrStatus } from "./scm-runtime";

/** The most items one batch lists, counted after leaving out what its operation cannot act on. */
const MAX_ITEMS = 1000;
/** An unconfirmed preview older than this is dropped; opening the same cleanup again reuses a younger one. */
const PREVIEW_TTL_MS = 24 * 3600_000;
/** Finished records outside the conversation kept for the transcript. */
const KEEP_FINISHED = 50;
const ENDED = new Set<string>(["completed", "cancelled"]);

/**
 * Whether a bulk operation can act on work in this state at all. Ended work
 * and work already in the requested state are left out of the list instead of
 * being listed as skipped; admission still decides each listed item.
 */
function bulkAccepts(operation: "pause" | "resume" | "cancel", state: TarsResponsibility["state"]) {
  if (ENDED.has(state)) return false;
  if (operation === "pause") return state !== "paused";
  if (operation === "resume") return state === "paused" || state === "blocked" || state === "waiting" || state === "takenOver";
  return true;
}

export function createTarsBatchRuntime(ports: {
  conversations: () => TarsConversationStore;
  responsibilities: () => TarsStore;
  cleanup: Pick<ReturnType<typeof createWorkspaceCleanupRuntime>, "list" | "act">;
  control: (input: TarsActInput) => Promise<TarsActResult>;
  undo?: (requestId: string, expectedRevision: number) => Promise<{ refusal: string | null }>;
  pr?: typeof fetchGitHubPrStatus;
}) {
  let chain = Promise.resolve();
  /** Records this runtime is executing; any other `executing` record was cut off and reads as interrupted. */
  const running = new Set<string>();
  const store = () => ports.conversations();
  const parse = (raw: unknown) => { const parsed = TarsBatchRecordSchema.safeParse(raw); return parsed.success ? parsed.data : null; };
  const settleInterrupted = (record: TarsBatchRecord) => {
    if (record.state !== "executing" || running.has(record.id)) return record;
    record.state = "interrupted";
    store().writeBatchHeader(record);
    return record;
  };
  const records = () => store().readBatchRecords().map(parse).filter((record): record is TarsBatchRecord => record !== null).map(settleInterrupted);
  const find = (id: string) => { const raw = store().readBatchRecords(id)[0]; const record = raw === undefined ? null : parse(raw); return record && settleInterrupted(record); };
  const prune = () => store().pruneBatchRecords(new Date(Date.now() - PREVIEW_TTL_MS).toISOString(), KEEP_FINISHED);
  const header = (record: TarsBatchRecord) => store().writeBatchHeader(record);
  const settle = (record: TarsBatchRecord) => {
    if (record.proposal && ["applied", "restored"].includes(record.state)) store().settleBatchProposal(record.proposal.messageId, record.proposal.actionIndex, new Date().toISOString());
    return record;
  };
  const proposalAllowed = (record: Pick<TarsBatchRecord, "proposal" | "action">) => {
    if (!record.proposal) return;
    const message = store().get(record.proposal.messageId);
    const receipt = store().getReceipt(record.proposal.messageId, record.proposal.actionIndex);
    if (!message || message.origin?.kind === "followUp" || message.origin?.kind === "reask" || receipt?.status !== "proposed" || JSON.stringify(receipt.action) !== JSON.stringify(record.action))
      throw new Error("This batch needs a current user proposal.");
  };
  /** One workspace's cleanup row, inspected alone: never a listing of every workspace. */
  const inspect = async (workspaceId: string, repositoryPath: string, scanDisk: boolean) =>
    (await ports.cleanup.list(scanDisk, false, { id: workspaceId, repositoryPath })).rows.find(row => row.id === workspaceId && row.repositoryPath === repositoryPath) ?? null;
  /** One pull request lookup for the branch; a merge the inspection already saw needs none. */
  const publicationBlocker = async (workspace: { repositoryPath: string; branch: string; reasons: string[] }) => {
    if (workspace.reasons.includes("prMerged")) return null;
    const pr = await (ports.pr ?? fetchGitHubPrStatus)({ cwd: workspace.repositoryPath, target: workspace.branch });
    return !pr.ok ? "prStatusUnavailable" : pr.pr?.state === "OPEN" ? "publicationPending" : null;
  };

  async function previewItems(action: TarsBatchAction): Promise<Pick<TarsBatchRecord, "items" | "omitted">> {
    const inScope = ports.responsibilities().snapshot().responsibilities.filter(row => tarsBatchContains(action.scope, row));
    const accepts = (row: TarsResponsibility) => action.kind === "cleanup" ? ENDED.has(row.state) : bulkAccepts(action.operation, row.state);
    const rows = inScope.filter(accepts);
    const omitted = inScope.filter(row => action.kind === "cleanup" ? !ENDED.has(row.state) : ENDED.has(row.state)).length;
    if (rows.length > MAX_ITEMS) throw new Error(`Narrow the scope to at most ${MAX_ITEMS} responsibilities.`);
    const workspaces = new Map<string, Awaited<ReturnType<typeof inspect>>>();
    const seen = new Set<string>();
    const items: TarsBatchRecord["items"] = [];
    for (const row of rows) {
      let reason: string | null = null;
      let workspace: Awaited<ReturnType<typeof inspect>> = null;
      if (action.kind === "cleanup") {
        if (row.executionWorkspaceId) {
          const key = JSON.stringify([row.repositoryPath, row.executionWorkspaceId]);
          if (!workspaces.has(key)) workspaces.set(key, await inspect(row.executionWorkspaceId, row.repositoryPath, true));
          workspace = workspaces.get(key) ?? null;
        }
        if (!workspace || workspace.branchOnly) reason = "ownershipChanged";
        else if (seen.has(workspace.id)) reason = "duplicateWorkspace";
        else if (workspace.blockers.length) reason = workspace.blockers.join(",");
        else if (workspace.archived && !action.permanentlyDeleteArchived) reason = "alreadyArchived";
        else if (action.deleteBranches && !workspace.branchDeletable) reason = "unmergedBranch";
        if (!reason && workspace) reason = await publicationBlocker(workspace);
        if (workspace) seen.add(workspace.id);
      } else if (action.operation === "cancel" && row.state === "takenOver") {
        // Work the user took over is theirs to cancel one by one, not in bulk.
        reason = "takenOver";
      } else {
        try { admitTarsControl(row, { responsibilityId: row.id, expectedRevision: row.revision, operation: action.operation }); }
        catch (error) { reason = error instanceof Error && "reason" in error ? String(error.reason) : "unknown"; }
      }
      items.push({ responsibilityId: row.id, revision: row.revision, workspaceId: row.executionWorkspaceId,
        name: row.title, repositoryPath: row.repositoryPath, bytes: workspace?.bytes ?? null, reason,
        action: action.kind === "bulkControl" ? action.operation : workspace?.archived ? "delete" : "archive", status: reason ? "skipped" : "included" });
    }
    return { items, ...(omitted ? { omitted } : {}) };
  }

  async function controlItem(record: TarsBatchRecord & { action: { kind: "bulkControl" } }, item: TarsBatchRecord["items"][number]) {
    const operation = record.action.operation;
    const requestId = `batch:${record.id}:${item.responsibilityId}`;
    const previous = store().getAction(requestId);
    if (previous && previous.status !== "pending") {
      item.status = previous.status === "applied" ? "applied" : "skipped";
      item.reason = previous.reason; item.undoable = canUndoTarsAction(previous); return;
    }
    const row = ports.responsibilities().get(item.responsibilityId);
    // Pause and resume are reversible: the frozen list is re-admitted against current state, since running work
    // saves a new revision on every observation. Cancel keeps the exact revision the user saw.
    const reversible = operation === "pause" || operation === "resume";
    if (!row || (!reversible && (row.revision !== item.revision || row.executionWorkspaceId !== item.workspaceId))) {
      item.status = "skipped"; item.reason = "stale"; return;
    }
    if (operation === "cancel" && row.state === "takenOver") { item.status = "skipped"; item.reason = "takenOver"; return; }
    // A dispatched request repeats with its saved revision, so the ledger recognizes it.
    const expectedRevision = previous?.action.kind === "control" ? previous.action.expectedRevision : reversible ? row.revision : item.revision;
    const result = await ports.control({ requestId, responsibilityId: row.id, expectedRevision, operation, source: "click" });
    item.status = result.record.status === "applied" ? "applied" : "skipped";
    item.reason = result.record.reason; item.undoable = canUndoTarsAction(result.record);
  }

  async function cleanupItem(record: TarsBatchRecord & { action: { kind: "cleanup" } }, item: TarsBatchRecord["items"][number], save: () => void) {
    const skip = (reason: string) => { item.status = "skipped"; item.reason = reason; };
    const row = ports.responsibilities().get(item.responsibilityId);
    if (!row || row.revision !== item.revision || row.executionWorkspaceId !== item.workspaceId || !item.workspaceId) return skip("stale");
    const fresh = await inspect(item.workspaceId, item.repositoryPath, false);
    if (!fresh || fresh.blockers.length || !ENDED.has(row.state)) return skip(fresh?.blockers.join(",") || "ownershipChanged");
    if (item.action === "delete" && !fresh.archived || item.action === "archive" && fresh.archived) return skip(fresh.archived ? "alreadyArchived" : "notArchived");
    const blocker = await publicationBlocker(fresh);
    if (blocker) return skip(blocker);
    // Persist dispatch before destructive I/O. An interrupted item is never replayed automatically.
    item.status = "applying"; save();
    const dispatchedAt = Date.now();
    const result = await ports.cleanup.act({ action: item.action === "delete" ? "delete" : "archive", workspaceId: item.workspaceId, repositoryPath: item.repositoryPath, deleteBranch: record.action.deleteBranches, archivedOnly: item.action === "delete" });
    item.status = result.ok ? "applied" : "skipped"; item.reason = result.reason;
    if (result.ok || item.action !== "archive") return;
    // Someone else archived it first: the archive is theirs, and Restore must not revive it.
    if (result.reason === "notActiveWorkspace") return skip("alreadyArchived");
    const after = await inspect(item.workspaceId, item.repositoryPath, false);
    if (!after?.archived) return;
    // Applied only when this action made the archive (it can keep the archive although a later step failed).
    const archivedAt = Date.parse(after.archivedAt ?? "");
    if (!Number.isFinite(archivedAt) || archivedAt >= dispatchedAt) item.status = "applied";
    else skip("alreadyArchived");
  }

  async function execute(record: TarsBatchRecord) {
    proposalAllowed(record);
    running.add(record.id);
    record.state = "executing";
    header(record);
    try {
      for (const [index, item] of record.items.entries()) {
        if (item.status !== "included") continue;
        const save = () => store().writeBatchItem(record.id, index, item);
        if (record.action.kind === "bulkControl") await controlItem(record as TarsBatchRecord & { action: { kind: "bulkControl" } }, item);
        else await cleanupItem(record as TarsBatchRecord & { action: { kind: "cleanup" } }, item, save);
        save();
      }
      record.state = "applied";
      header(record);
    } catch (error) {
      // What ran stays recorded; Continue runs the remaining frozen items.
      try { record.state = "interrupted"; header(record); } catch { /* The next read settles it. */ }
      throw error;
    } finally { running.delete(record.id); }
    prune();
    if (record.proposal) store().settleBatchProposal(record.proposal.messageId, record.proposal.actionIndex, new Date().toISOString());
    return record;
  }

  async function restore(record: TarsBatchRecord) {
    if (record.state !== "applied") return record;
    const reversible = record.items.filter(item => item.status === "applied" && (item.action === "archive" || item.undoable));
    if (!reversible.length) return record;
    for (const [index, item] of record.items.entries()) {
      if (!reversible.includes(item)) continue;
      if (item.undoable) {
        const previous = store().getAction(`batch:${record.id}:${item.responsibilityId}`);
        const result = previous?.undo?.undoneAt ? { refusal: null } : previous && ports.undo ? await ports.undo(previous.requestId, previous.revision) : { refusal: "unsupported" };
        if (!result.refusal) item.status = "restored"; else item.reason = result.refusal;
      } else {
        const result = await ports.cleanup.act({ action: "restore", workspaceId: item.workspaceId!, repositoryPath: item.repositoryPath });
        if (result.ok) { item.status = "restored"; if (result.readOnly) item.readOnly = true; } else item.reason = result.reason;
      }
      store().writeBatchItem(record.id, index, item);
    }
    if (!record.items.some(item => item.status === "applied" && (item.action === "archive" || item.undoable))) record.state = "restored";
    header(record);
    return record;
  }

  async function perform(raw: unknown): Promise<TarsBatchRecord> {
    const input = TarsBatchInputSchema.parse(raw);
    if (input.operation === "preview") {
      prune();
      const existing = input.proposal && records().find(row => row.proposal?.messageId === input.proposal!.messageId && row.proposal?.actionIndex === input.proposal!.actionIndex);
      if (existing) return settle(existing);
      proposalAllowed(input);
      const action = input.action;
      // One open preview per cleanup or bulk control opened outside the conversation: refresh it instead of adding another.
      const open = input.proposal ? null : records().find(row => !row.proposal && row.state === "proposed" && JSON.stringify(row.action) === JSON.stringify(action));
      const { items, omitted } = await previewItems(action);
      const record: TarsBatchRecord = { id: open?.id ?? randomUUID(), action, ...(input.proposal ? { proposal: input.proposal } : {}), state: "proposed", items,
        ...(omitted ? { omitted } : {}), createdAt: new Date().toISOString() };
      store().writeBatchRecord(record);
      return record;
    }
    const record = find(input.id);
    if (!record) throw new Error("The batch was not found.");
    if (input.operation === "decline") {
      if (record.state !== "proposed") return record;
      if (!record.proposal) { store().deleteBatchRecord(record.id); return { ...record, state: "declined" }; }
      record.state = "declined"; header(record); return record;
    }
    if (input.operation === "restore") return restore(record);
    if (record.state === "applied" || record.state === "restored") return settle(record);
    if (record.state !== "proposed" && record.state !== "interrupted") return record;
    return execute(record);
  }
  return { list: records, invoke(raw: unknown) {
    const next = chain.then(() => perform(raw));
    chain = next.then(() => {}, () => {});
    return next;
  } };
}
