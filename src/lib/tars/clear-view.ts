import type { TarsActionReceipt, TarsConversation } from "./conversation";
import { tarsClearProposalRequestId, type TarsClearRecord, type TarsClearScope } from "./clearing";
import { tarsUnverifiedDecisionId, type TarsDecisionView } from "./decisions";

/**
 * What stays in the conversation view after a conversation clear, whatever
 * its time: a message whose decision still waits on the user (a question, a
 * confirmation, Stave's unverified-completion choice) or whose publish or
 * clear proposal still waits for its card's confirmation. Read from the full
 * saved state (`projectTarsDecisions` over every message, not the cleared view).
 */
export function tarsClearKeeps(args: { decisions: readonly TarsDecisionView[]; receipts: readonly TarsActionReceipt[] }) {
  const waiting = args.decisions.filter((view) => view.state === "waiting");
  return {
    messageIds: new Set([
      ...waiting.flatMap((view) => view.messageId ? [view.messageId] : []),
      ...args.receipts.filter((receipt) => (receipt.action.kind === "publish" || receipt.action.kind === "clear") && receipt.status === "proposed")
        .map((receipt) => receipt.messageId),
    ]),
    decisionIds: new Set(waiting.map((view) => view.id)),
  };
}

/**
 * The conversation as a window reads it after a conversation clear at
 * `clearedAt`: entries from after it, plus what still needs the user or is
 * still under way. A queued or reasoning message, and one that was queued or
 * reasoning when the clear was saved (`inProgress`, so its reply stays even
 * when it lands in the clear's own millisecond), words still waiting to be
 * said in a task and a confirmation still publishing stay; so do the kept
 * messages and Stave's waiting unverified-completion cards. Answers stay as
 * lookups for the cards that remain. Clears are listed from the active one on,
 * so its own record (with Restore) leads the view. Nothing is deleted.
 */
export function filterTarsConversationView(conversation: TarsConversation, args: {
  clearedAt: string | null;
  /** The active clear's `inProgress`: messages under way when it was saved. */
  inProgress: readonly string[];
  keeps: ReturnType<typeof tarsClearKeeps>;
}): TarsConversation {
  const { clearedAt, keeps } = args;
  if (!clearedAt) return conversation;
  const after = (at: string) => at > clearedAt;
  const underWay = new Set(args.inProgress);
  // A message still under way, or one that was when the clear was saved, keeps its place: a reply never vanishes because it came late.
  const messages = conversation.messages.filter((message) => after(message.createdAt) || after(message.updatedAt) || message.state === "queued"
    || message.state === "reasoning" || underWay.has(message.id) || keeps.messageIds.has(message.id));
  const kept = new Set(messages.map((message) => message.id));
  return {
    ...conversation,
    messages,
    receipts: conversation.receipts.filter((receipt) => kept.has(receipt.messageId)),
    records: conversation.records.filter((record) => after(record.createdAt) || record.delivery?.status === "queued" || record.delivery?.status === "delivering"),
    activity: conversation.activity.filter((entry) => after(entry.createdAt)
      || (entry.detailCode === "unverifiedCompletion" && keeps.decisionIds.has(tarsUnverifiedDecisionId(entry.responsibilityId, entry.revision)))),
    ...(conversation.events ? { events: conversation.events.filter((event) => after(event.processedAt ?? event.createdAt)) } : {}),
    ...(conversation.publications ? { publications: conversation.publications.filter((record) => after(record.createdAt) || record.status === "pending") } : {}),
    ...(conversation.clears ? { clears: conversation.clears.filter((record) => record.createdAt >= clearedAt) } : {}),
  };
}

/**
 * A clear Tars proposed from the user's words, as the conversation shows it:
 * `waiting` while its card can be confirmed, `settled` once confirmed (its
 * record says what it hid). A proposal refused when it was made stays a
 * receipt line with its reason.
 */
export interface TarsClearProposalView {
  requestId: string;
  messageId: string;
  actionIndex: number;
  scopes: TarsClearScope[];
  state: "waiting" | "settled";
  record: TarsClearRecord | null;
}

export function projectTarsClearProposals(receipts: readonly TarsActionReceipt[], clears: readonly TarsClearRecord[]): TarsClearProposalView[] {
  const records = new Map(clears.map((record) => [record.requestId, record]));
  return receipts.flatMap((receipt): TarsClearProposalView[] => {
    if (receipt.action.kind !== "clear") return [];
    const requestId = tarsClearProposalRequestId(receipt.messageId, receipt.actionIndex);
    const record = records.get(requestId) ?? null;
    const base = { requestId, messageId: receipt.messageId, actionIndex: receipt.actionIndex, scopes: receipt.action.scopes, record };
    if (record) return [{ ...base, state: "settled" }];
    return receipt.status === "proposed" ? [{ ...base, state: "waiting" }] : [];
  });
}

/**
 * The clear a tray lane's Undo restores: the newest applied clear of `scope`
 * that hid something. `trayClears` carries it whatever the conversation
 * clear's time, so clearing the conversation never takes a lane's Undo away.
 */
export function tarsLaneUndoClear(conversation: Pick<TarsConversation, "clears" | "trayClears"> | null, scope: "done" | "outputs"): TarsClearRecord | null {
  let newest: TarsClearRecord | null = null;
  // Oldest first, as the host lists them: the later of two records of the same time wins.
  for (const record of [...(conversation?.trayClears ?? []), ...(conversation?.clears ?? [])]) {
    if (record.status === "applied" && (record[scope]?.length ?? 0) > 0 && (!newest || record.createdAt >= newest.createdAt)) newest = record;
  }
  return newest;
}
