import { tarsWorkspaceRecordId } from "./workspace-action";
import type { TarsActionRecord, TarsActionReceipt, TarsConversation, TarsInspectAction } from "./conversation";
import { canUndoTarsAction } from "./action-undo";
import { projectTarsDecisions, tarsTargetsMovedOn, type TarsDecisionView } from "./decisions";
import type { TarsActivity, TarsResponsibility } from "./types";
import type { TarsPublishRecord } from "./publication";

type WorkAction = TarsActionReceipt["action"];
export type TarsActivityFilter = "all" | "tars" | "needsYou";
export const TARS_ACTIVITY_FILTERS: readonly TarsActivityFilter[] = ["all", "tars", "needsYou"];
export type TarsActivityContent =
  | { kind: "action"; action: WorkAction | TarsActionRecord["action"]; status: TarsActionReceipt["status"] | "undone" }
  | { kind: "observation"; activity: TarsActivity }
  | { kind: "publication"; publication: TarsPublishRecord }
  | { kind: "decision"; decision: TarsDecisionView }
  | { kind: "inspection"; view: TarsInspectAction["view"]; reading: boolean; status?: "read" | "notOwned" | "unavailable" | "sizeLimit" };
export interface TarsActivityEntry {
  id: string; at: string; responsibilityId: string | null; title: string | null;
  origin: "you" | "tars"; doneByTars: boolean; needsYou: boolean;
  content: TarsActivityContent; undo: TarsActionRecord | null;
}

/** A single projection over existing durable history; no extra event ledger or guessed inverses. */
export function projectTarsActivity(conversation: TarsConversation, responsibilities: readonly TarsResponsibility[] | null): TarsActivityEntry[] {
  const rows = new Map(responsibilities?.map((row) => [row.id, row]));
  const titles = new Map(conversation.activity.map(item => [item.responsibilityId, item.title]));
  for (const receipt of conversation.receipts) if (receipt.action.kind === "delegate" && receipt.responsibilityId) titles.set(receipt.responsibilityId, receipt.action.title);
  const entries: TarsActivityEntry[] = [];
  const add = (entry: Omit<TarsActivityEntry, "title"> & { title?: string | null }) => entries.push({ ...entry,
    title: entry.title ?? (entry.responsibilityId ? rows.get(entry.responsibilityId)?.title ?? titles.get(entry.responsibilityId) : null) ?? null });
  const records = new Map(conversation.records.map((record) => [record.requestId, record]));
  const decisions = projectTarsDecisions({ ...conversation, answers: conversation.answers ?? [], responsibilities });
  const decisionReceipts = new Set(decisions.map((decision) => `${decision.messageId}:${decision.actionIndex}`));
  const publishedProposals = new Set((conversation.publications ?? []).flatMap((publication) => publication.proposal
    ? [`${publication.proposal.messageId}:${publication.proposal.actionIndex}`] : []));
  for (const record of conversation.records) {
    const action = record.action;
    add({ id: `record:${record.requestId}`, at: record.createdAt,
      responsibilityId: "responsibilityId" in action ? action.responsibilityId : null,
      title: record.undo?.kind === "workspace" ? record.undo.workspaceName : undefined,
      origin: record.source === "automatic" || action.kind === "workspace" ? "tars" : "you", doneByTars: record.source === "automatic" || action.kind === "workspace", needsYou: false,
      content: { kind: "action", action, status: record.undo?.undoneAt ? "undone" : record.status },
      undo: canUndoTarsAction(record) ? record : null });
  }
  for (const receipt of conversation.receipts) {
    const key = `${receipt.messageId}:${receipt.actionIndex}`;
    // These records are the same effect, with the host's Undo/delivery metadata.
    if (records.has(`auto:${key}`) || records.has(tarsWorkspaceRecordId(receipt.messageId, receipt.actionIndex)) || publishedProposals.has(key) || decisionReceipts.has(key)) continue;
    const action = receipt.action;
    add({ id: `receipt:${key}`, at: receipt.createdAt, responsibilityId: receipt.responsibilityId ?? ("responsibilityId" in action ? action.responsibilityId : null),
      title: action.kind === "delegate" ? action.title : undefined, origin: "tars", doneByTars: receipt.status === "applied", needsYou: receipt.status === "proposed",
      content: { kind: "action", action, status: receipt.status }, undo: null });
  }
  for (const activity of conversation.activity) {
    add({ id: `activity:${activity.id}`, at: activity.createdAt, responsibilityId: activity.responsibilityId, title: activity.title,
      origin: "tars", doneByTars: true, needsYou: false, content: { kind: "observation", activity }, undo: null });
  }
  for (const publication of conversation.publications ?? []) {
    add({ id: `publication:${publication.requestId}`, at: publication.updatedAt, responsibilityId: publication.responsibilityId,
      origin: publication.source === "automatic" ? "tars" : "you", doneByTars: true, needsYou: false,
      content: { kind: "publication", publication }, undo: null });
  }
  for (const decision of decisions) {
    const target = decision.targets[0]?.responsibilityId ?? null;
    const closure = decision.closure;
    // A projected expiration has no invented timestamp: use the saved target change or later message that ended it.
    const revision = decision.targets[0]?.expectedRevision ?? 0;
    const change = conversation.activity.filter((item) => item.responsibilityId === target && item.revision > revision && item.createdAt >= decision.since)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    const later = conversation.messages.slice(conversation.messages.findIndex((message) => message.id === decision.messageId) + 1);
    const movedOn = decision.state === "retired" && decision.why === "movedOn"
      ? later.find((_, index) => tarsTargetsMovedOn(decision.targets.map((target) => target.responsibilityId), later.slice(0, index + 1))) : null;
    add({ id: `decision:${decision.id}`, at: closure?.createdAt ?? decision.answer?.createdAt ?? decision.record?.createdAt
      ?? ((decision.state === "invalid" || decision.state === "retired") ? movedOn?.createdAt ?? change?.createdAt ?? decision.since : decision.since),
      responsibilityId: target, origin: closure?.source === "tars" || !closure && !decision.answer && !decision.record ? "tars" : "you",
      doneByTars: decision.state === "withdrawn", needsYou: decision.state === "waiting",
      content: { kind: "decision", decision }, undo: null });
  }
  for (const message of conversation.messages) {
    const inspections = message.inspections ? [...message.inspections, ...(message.inspection?.reading ? [message.inspection] : [])]
      : message.inspection ? [message.inspection] : [];
    for (const [index, inspection] of inspections.entries()) {
      add({ id: `inspection:${message.id}:${index}`, at: inspection.at, responsibilityId: inspection.responsibilityId, title: inspection.title,
        origin: "tars", doneByTars: true, needsYou: false,
        content: { kind: "inspection", view: inspection.view, reading: inspection.reading, status: inspection.status }, undo: null });
    }
  }
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

/** Group by the user's local calendar, preserving newest-first order in every filter. */
export function groupTarsActivity(entries: readonly TarsActivityEntry[], filter: TarsActivityFilter = "all") {
  const days = new Map<string, { day: string; at: string; entries: TarsActivityEntry[] }>();
  for (const entry of [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))) {
    if (filter === "tars" && !entry.doneByTars || filter === "needsYou" && !entry.needsYou) continue;
    const date = new Date(entry.at);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (!days.has(day)) days.set(day, { day, at: entry.at, entries: [] });
    days.get(day)!.entries.push(entry);
  }
  return [...days.values()];
}
