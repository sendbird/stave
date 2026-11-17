import type { TarsConversation } from "./conversation";
import type { TarsDecisionView } from "./decisions";
import { selectTarsActivityNotices } from "./flow-model";
import type { TarsPublishProposalView } from "./publish-model";
import type { TarsSideViewTarget } from "./side-view";
import type { TarsState } from "./types";
import type { TarsAwaySpan } from "./away-state";

/**
 * What the "while you were away" card says (`away-state` holds when it
 * shows): read from the conversation the window already holds, never from a
 * model call.
 */

/** How many pieces of work each group names before "and N more". */
export const TARS_AWAY_LIST_LIMIT = 3;

const time = (at: string) => Date.parse(at);

export type TarsAwayGroupKind = "waiting" | "blocked" | "finished" | "pullRequests";
/** Waiting on the user first, then what stopped, what finished, and what was published. */
export const TARS_AWAY_GROUP_ORDER: readonly TarsAwayGroupKind[] = ["waiting", "blocked", "finished", "pullRequests"];

/** Why an item is in the blocked group, in its own words on the card. */
export type TarsAwayTrouble = "blocked" | "cancelled" | "followUpLimit" | "publishFailed";

/** Where an item's link goes: a part of the side view, or its own card or record in the conversation. */
export type TarsAwayLink =
  | { kind: "side"; target: TarsSideViewTarget }
  | { kind: "decision"; decisionId: string }
  | { kind: "publishCard"; requestId: string }
  | { kind: "publishRecord"; requestId: string };

/** Waiting forms live in the composer dock; settled cards and records stay in the transcript. */
export function tarsAwayDockId(link: TarsAwayLink, decisions: readonly Pick<TarsDecisionView, "id" | "state">[],
  publications: readonly Pick<TarsPublishProposalView, "requestId" | "state">[] = []): string | null {
  if (link.kind === "decision") return decisions.some((decision) => decision.id === link.decisionId && decision.state === "waiting") ? link.decisionId : null;
  if (link.kind === "publishCard") return publications.some((proposal) => proposal.requestId === link.requestId && proposal.state === "waiting") ? link.requestId : null;
  return null;
}

export interface TarsAwayItem {
  /** Unique in its group. */
  key: string;
  /** The work it is about; null for a question that names no work. */
  responsibilityId: string | null;
  /** The work's title; null with `responsibilityId`. */
  title: string | null;
  /** A question's own words, when the item names no work. */
  question: string | null;
  at: string;
  link: TarsAwayLink;
  trouble?: TarsAwayTrouble;
  /** A draft pull request's number, when it has one. */
  pullRequest?: number | null;
}

export interface TarsAwayGroup {
  kind: TarsAwayGroupKind;
  count: number;
  /** The newest first, at most `limit`. */
  items: TarsAwayItem[];
  more: number;
}

export interface TarsAwaySummary extends TarsAwaySpan {
  groups: TarsAwayGroup[];
  total: number;
}

type Activity = TarsConversation["activity"][number];

const NOTICE_STATE: Record<"completed" | "blocked" | "cancelled", TarsState> = { completed: "completed", blocked: "blocked", cancelled: "cancelled" };

/**
 * What happened in `span`, grouped: decisions that wait for the user, work
 * that is blocked or ended unfinished, work that finished, and draft pull
 * requests that opened. Each piece of work is counted once per group and only
 * as it stands now: work that was blocked and then went on is not listed as
 * blocked, and work whose block is a waiting decision is listed as the
 * decision. Null when there is no span or nothing happened in it, so the card
 * never says "0 finished".
 */
export function buildTarsAwaySummary(args: {
  span: TarsAwaySpan | null;
  conversation: Pick<TarsConversation, "activity" | "records" | "receipts" | "events" | "publications"> | null;
  decisions: readonly TarsDecisionView[];
  publishProposals?: readonly TarsPublishProposalView[];
  titleOf?: (responsibilityId: string) => string | undefined;
  limit?: number;
}): TarsAwaySummary | null {
  const { span, conversation } = args;
  if (!span || !conversation) return null;
  const since = time(span.since);
  const until = time(span.until);
  if (!(since < until)) return null;
  const within = (at: string) => { const value = time(at); return value > since && value <= until; };
  const activityTitle = new Map<string, string>();
  const latestState = new Map<string, Activity>();
  for (const event of [...conversation.activity].sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.revision - b.revision)) {
    activityTitle.set(event.responsibilityId, event.title);
    latestState.set(event.responsibilityId, event);
  }
  const titleOf = (id: string) => args.titleOf?.(id) ?? activityTitle.get(id) ?? id;
  const items: Record<TarsAwayGroupKind, Map<string, TarsAwayItem>> = { waiting: new Map(), blocked: new Map(), finished: new Map(), pullRequests: new Map() };
  /** The newest entry of one key wins. */
  const put = (group: TarsAwayGroupKind, item: TarsAwayItem) => {
    const existing = items[group].get(item.key);
    if (!existing || time(existing.at) <= time(item.at)) items[group].set(item.key, item);
  };

  for (const view of args.decisions) {
    if (view.state !== "waiting" || !within(view.since)) continue;
    const responsibilityId = view.targets[0]?.responsibilityId ?? null;
    put("waiting", { key: `decision:${view.id}`, responsibilityId, title: responsibilityId ? titleOf(responsibilityId) : null,
      question: view.question, at: view.since, link: { kind: "decision", decisionId: view.id } });
  }
  for (const proposal of args.publishProposals ?? []) {
    if (proposal.state !== "waiting") continue;
    // A proposal waits from the moment Tars made it.
    const at = conversation.receipts.find((receipt) => receipt.messageId === proposal.messageId && receipt.actionIndex === proposal.actionIndex)?.createdAt;
    if (!at || !within(at)) continue;
    put("waiting", { key: `publish:${proposal.requestId}`, responsibilityId: proposal.responsibilityId, title: titleOf(proposal.responsibilityId),
      question: null, at, link: { kind: "publishCard", requestId: proposal.requestId } });
  }
  const waitingWork = new Set([...items.waiting.values()].flatMap((item) => item.responsibilityId ? [item.responsibilityId] : []));

  for (const notice of selectTarsActivityNotices(conversation.activity, conversation.records)) {
    const { activity } = notice;
    if (!within(activity.createdAt)) continue;
    // Only as the work stands now: a block it has since left, or an end it was started again from, is not news.
    if (latestState.get(activity.responsibilityId)?.state !== NOTICE_STATE[notice.kind]) continue;
    const base = { key: activity.responsibilityId, responsibilityId: activity.responsibilityId, title: titleOf(activity.responsibilityId), question: null, at: activity.createdAt };
    if (notice.kind === "completed") put("finished", { ...base, link: { kind: "side", target: { responsibilityId: activity.responsibilityId, kind: "report" } } });
    else if (waitingWork.has(activity.responsibilityId)) continue;
    else if (notice.kind === "blocked") put("blocked", { ...base, trouble: "blocked",
      link: { kind: "side", target: { responsibilityId: activity.responsibilityId, kind: "report", focus: { unmet: true } } } });
    else put("blocked", { ...base, trouble: "cancelled", link: { kind: "side", target: { responsibilityId: activity.responsibilityId, kind: "timeline" } } });
  }
  for (const event of conversation.events ?? []) {
    const at = event.processedAt ?? event.createdAt;
    if (event.status !== "exhausted" || !within(at) || waitingWork.has(event.responsibilityId) || items.blocked.has(event.responsibilityId)) continue;
    // Tars stopped following this work up by itself; if the work went on anyway there is nothing to look at.
    const state = latestState.get(event.responsibilityId)?.state;
    if (state === "completed" || state === "running") continue;
    put("blocked", { key: event.responsibilityId, responsibilityId: event.responsibilityId, title: titleOf(event.responsibilityId), question: null, at,
      trouble: "followUpLimit", link: { kind: "side", target: { responsibilityId: event.responsibilityId, kind: "timeline" } } });
  }
  const publications = [...conversation.publications ?? []].sort((a, b) => time(a.updatedAt) - time(b.updatedAt));
  const newestPublication = new Map(publications.map((record) => [record.responsibilityId, record]));
  for (const record of publications) {
    // Only the newest attempt of a piece of work speaks for it: a failure that was retried is not news.
    if (newestPublication.get(record.responsibilityId) !== record || !within(record.updatedAt)) continue;
    const base = { key: record.responsibilityId, responsibilityId: record.responsibilityId, title: titleOf(record.responsibilityId), question: null, at: record.updatedAt,
      link: { kind: "publishRecord" as const, requestId: record.requestId } };
    if (record.status === "applied") put("pullRequests", { ...base, pullRequest: record.number });
    else if (record.status === "rejected" && record.reason === "publishFailed" && !items.blocked.has(record.responsibilityId)) put("blocked", { ...base, trouble: "publishFailed" });
  }

  const limit = args.limit ?? TARS_AWAY_LIST_LIMIT;
  const groups = TARS_AWAY_GROUP_ORDER.flatMap((kind): TarsAwayGroup[] => {
    const all = [...items[kind].values()].sort((a, b) => time(b.at) - time(a.at) || a.key.localeCompare(b.key));
    return all.length ? [{ kind, count: all.length, items: all.slice(0, limit), more: Math.max(0, all.length - limit) }] : [];
  });
  if (!groups.length) return null;
  return { since: span.since, until: span.until, groups, total: groups.reduce((sum, group) => sum + group.count, 0) };
}

/**
 * Puts the summary's card where the user left: before the first entry (in
 * time order) newer than `since`. The card takes that entry's time, so it sits
 * under the same day as what it summarizes, and is told that entry's id (the
 * first thing the user has not seen). With nothing newer it goes last, with no
 * such entry.
 */
export function placeTarsAwayCard<T extends { id: string; at: string }>(entries: readonly T[], since: string,
  card: (at: string, firstNewId: string | null) => T): T[] {
  const index = entries.findIndex((entry) => time(entry.at) > time(since));
  if (index < 0) return [...entries, card(entries.at(-1)?.at ?? since, null)];
  const first = entries[index]!;
  return [...entries.slice(0, index), card(first.at, first.id), ...entries.slice(index)];
}
