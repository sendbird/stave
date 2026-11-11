import type { TarsActionReceipt, TarsMessageView } from "./conversation";
import { isAppliedDelegateReceipt } from "./flow-model";
import { isTarsPublishable } from "./publish-model";
import { tarsQueueOf } from "./queue-order";
import type { TarsTrayModel } from "./tray-model";
import { isTarsWorkRunning } from "./live-progress";
import type { TarsResponsibility } from "./types";

/**
 * What a suggestion asks Tars:
 * - `needsYou`: what waits on the user, when anything does;
 * - `followUp`: how work Tars just delegated in its last reply is going;
 * - `blocked`: why one piece of blocked work stopped;
 * - `resume`: continue work that is paused;
 * - `startNow` / `startQueued`: start queued work now (one, or all of it);
 * - `publish`: open a draft PR for work that completed today and can publish;
 * - `report`: show the report of work that completed today;
 * - `finishedToday`: what finished today, when several things did;
 * - `progress`: how running work is going.
 */
export type TarsSuggestionKind = "needsYou" | "followUp" | "blocked" | "resume" | "startNow" | "startQueued" | "publish" | "report" | "finishedToday" | "progress";

export interface TarsSuggestion {
  /** Stable while the fact holds, so a chip keeps its place and focus across reads. */
  id: string;
  kind: TarsSuggestionKind;
  /** The work it is about, shortened for the chip; null for one about several. */
  title: string | null;
  /** The full title, for the words it puts in the message box. */
  fullTitle: string | null;
  count: number;
}

/** A chip row stays short: more choices would read as a menu, not a nudge. */
export const TARS_SUGGESTIONS_MAX = 4;
/** A title longer than this is cut for the chip; the words it inserts keep the whole title. */
export const TARS_SUGGESTION_TITLE_MAX = 32;
const DAY_MS = 86_400_000;
/** Delegated work whose progress is the question: it has not ended, blocked, paused or passed to the user. */
const FOLLOWABLE: ReadonlySet<TarsResponsibility["state"]> = new Set(["queued", "preparing", "running", "waiting"]);

function shorten(title: string) {
  return title.length > TARS_SUGGESTION_TITLE_MAX ? `${title.slice(0, TARS_SUGGESTION_TITLE_MAX - 1).trimEnd()}…` : title;
}

/** The work an applied delegation in the newest reply admitted, when nothing was said after it. */
function delegatedInLastReply(messages: readonly TarsMessageView[], receipts: readonly TarsActionReceipt[]) {
  const last = messages.at(-1);
  if (!last || last.state !== "answered") return [];
  return receipts.filter((receipt) => receipt.messageId === last.id && isAppliedDelegateReceipt(receipt)).map((receipt) => receipt.responsibilityId!);
}

/** Work that completed in the day before `now`, newest first. */
export function tarsFinishedSince(rows: readonly TarsResponsibility[], now: string) {
  const since = Date.parse(now) - DAY_MS;
  return rows.filter((row) => row.state === "completed" && Date.parse(row.updatedAt) >= since).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Suggested requests from what Stave observed now, most useful first, at most
 * `limit` and one per piece of work. Each only fills the message box; the user
 * still sends it. Nothing is suggested before the work was read, so a chip
 * never claims a state on a guess. Ended work the tray cleared is not suggested.
 */
export function buildTarsSuggestions(args: {
  tray: Pick<TarsTrayModel, "lanes" | "counts"> | null;
  messages: readonly TarsMessageView[];
  receipts: readonly TarsActionReceipt[];
  now: string;
  limit?: number;
}): TarsSuggestion[] {
  const { tray } = args;
  if (!tray) return [];
  const limit = args.limit ?? TARS_SUGGESTIONS_MAX;
  const rows = [...tray.lanes.needsYou, ...tray.lanes.running, ...tray.lanes.done].map((card) => card.row);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out: TarsSuggestion[] = [];
  const covered = new Set<string>();
  const add = (kind: TarsSuggestionKind, row: TarsResponsibility | null, count = 1) => {
    if (out.length >= limit || (row && covered.has(row.id)) || out.some((entry) => entry.kind === kind && !row)) return;
    if (row) covered.add(row.id);
    out.push({ id: row ? `${kind}:${row.id}:${row.revision}` : `${kind}:${count}`, kind, title: row ? shorten(row.title) : null, fullTitle: row?.title ?? null, count });
  };
  if (tray.counts.needsYou > 0) add("needsYou", null, tray.counts.needsYou);
  for (const id of delegatedInLastReply(args.messages, args.receipts)) {
    const row = byId.get(id);
    // Work that blocked, paused or passed to the user has its own, more useful suggestion.
    if (row && FOLLOWABLE.has(row.state)) { add("followUp", row); break; }
  }
  const blocked = rows.find((row) => row.state === "blocked" && row.detailCode !== "unverifiedCompletion");
  if (blocked) add("blocked", blocked);
  const paused = rows.find((row) => row.state === "paused");
  if (paused) add("resume", paused);
  const queued = tarsQueueOf(rows);
  if (queued.length === 1) add("startNow", queued[0]!);
  else if (queued.length > 1) add("startQueued", null, queued.length);
  const finished = tarsFinishedSince(tray.lanes.done.map((card) => card.row), args.now);
  if (finished.length > 1) add("finishedToday", null, finished.length);
  const newest = finished[0];
  if (newest) add(isTarsPublishable(newest) && !newest.publication ? "publish" : "report", newest);
  const running = rows.filter(isTarsWorkRunning).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = running.find((row) => !covered.has(row.id));
  if (first) add("progress", first);
  return out;
}
