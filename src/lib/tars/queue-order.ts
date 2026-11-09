import type { TarsResponsibility } from "./types";

/** The priority range a responsibility can take (`TarsResponsibility.priority`). */
export const TARS_PRIORITY_MIN = 0;
export const TARS_PRIORITY_MAX = 100;
/** How far past its neighbor work moved to either end of the queue lands, leaving room for later moves. */
const TARS_QUEUE_END_STEP = 10;

export type TarsQueueRow = Pick<TarsResponsibility, "id" | "priority" | "createdAt">;

/** One place earlier or later in the queue; with `relativeTo`, directly before (earlier) or after (later) that queued work. */
export interface TarsQueueMove {
  direction: "earlier" | "later";
  relativeTo?: string;
}

/** The runtime's queue order (`tars-runtime.ts`): higher priority first, then oldest, then id. */
export function compareTarsQueue(a: TarsQueueRow, b: TarsQueueRow): number {
  return b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Queued work in the order it will start. Only queued work can move; started work keeps its place. */
export function tarsQueueOf<T extends TarsQueueRow & Pick<TarsResponsibility, "state">>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.state === "queued").sort(compareTarsQueue);
}

/** Why a move cannot apply: the work is not queued, it is already at that end, or the queue changed since it was seen. */
export type TarsQueueMoveRefusal = "notQueued" | "queueEdge" | "stale" | "noRoom";

export type TarsQueuePlan =
  | { ok: true; changes: Array<{ id: string; priority: number }> }
  | { ok: false; reason: TarsQueueMoveRefusal };

/** Whether `a` runs before `b` when both have the same priority. */
const tieFirst = (a: TarsQueueRow, b: TarsQueueRow) => (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) < 0;

/**
 * The priorities that put queued work where a move asks, within 0..100.
 * The moved work alone changes whenever a priority between its new neighbors
 * exists (ties fall back to the oldest-first rule, so an equal priority can
 * be enough); between two neighbors it takes the middle, at either end it
 * goes ten past its neighbor. Only when no such priority exists does it
 * renumber, changing as few other rows as possible and moving them as little
 * as possible. The moved work comes first in `changes`.
 */
export function planTarsQueueMove(queue: readonly TarsQueueRow[], id: string, move: TarsQueueMove): TarsQueuePlan {
  const order = [...queue].sort(compareTarsQueue);
  const from = order.findIndex((row) => row.id === id);
  if (from < 0) return { ok: false, reason: "notQueued" };
  const target = order[from]!;
  let anchor: number;
  if (move.relativeTo === undefined) {
    anchor = move.direction === "earlier" ? from - 1 : from + 1;
    if (anchor < 0 || anchor >= order.length) return { ok: false, reason: "queueEdge" };
  } else {
    anchor = order.findIndex((row) => row.id === move.relativeTo);
    // The other work is no longer queued, or no longer on the side the user moved toward.
    if (anchor < 0 || anchor === from || (move.direction === "earlier" ? anchor > from : anchor < from)) return { ok: false, reason: "stale" };
  }
  const rest = order.filter((row) => row.id !== id);
  const anchorRow = order[anchor]!;
  const at = rest.indexOf(anchorRow) + (move.direction === "earlier" ? 0 : 1);
  const desired = [...rest.slice(0, at), target, ...rest.slice(at)];
  const position = desired.indexOf(target);
  const previous = desired[position - 1];
  const next = desired[position + 1];
  // After `previous` and before `next`, counting the oldest-first tie rule.
  const high = previous ? (tieFirst(previous, target) ? previous.priority : previous.priority - 1) : TARS_PRIORITY_MAX;
  const low = next ? (tieFirst(target, next) ? next.priority : next.priority + 1) : TARS_PRIORITY_MIN;
  const lo = Math.max(TARS_PRIORITY_MIN, low);
  const hi = Math.min(TARS_PRIORITY_MAX, high);
  if (lo <= hi) {
    const wanted = previous && next ? Math.round((previous.priority + next.priority) / 2)
      : previous ? previous.priority - TARS_QUEUE_END_STEP : next!.priority + TARS_QUEUE_END_STEP;
    return { ok: true, changes: [{ id, priority: Math.min(hi, Math.max(lo, wanted)) }] };
  }
  return renumber(desired, target);
}

/**
 * Fewest rows other than the moved one changed (then the smallest total
 * shift) so that `desired` reads in queue order. Each row's priority stays in
 * 0..100 and an equal neighbor is allowed only where the tie rule already
 * orders the pair.
 */
function renumber(desired: readonly TarsQueueRow[], target: TarsQueueRow): TarsQueuePlan {
  const values = TARS_PRIORITY_MAX - TARS_PRIORITY_MIN + 1;
  const INF = Number.POSITIVE_INFINITY;
  type Cost = [changed: number, shift: number];
  const better = (a: Cost, b: Cost) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  // cost[i][v]: the best prefix ending with row i at priority v; from[i][v]: row i-1's priority there.
  const cost: Cost[][] = [];
  const from: number[][] = [];
  desired.forEach((row, index) => {
    // The moved row may take any priority without counting as a change, but it too moves as little as it can.
    const own = (value: number): Cost => row === target ? [0, Math.abs(value - row.priority)]
      : value === row.priority ? [0, 0] : [1, Math.abs(value - row.priority)];
    const rowCost: Cost[] = [];
    const rowFrom: number[] = [];
    if (index === 0) {
      for (let value = 0; value < values; value++) { rowCost.push(own(value + TARS_PRIORITY_MIN)); rowFrom.push(-1); }
    } else {
      const prior = cost[index - 1]!;
      const tie = tieFirst(desired[index - 1]!, row);
      // best[v]: the cheapest previous priority >= v, scanning from the top.
      const best: Array<{ cost: Cost; value: number }> = new Array(values);
      let running = { cost: [INF, INF] as Cost, value: -1 };
      for (let value = values - 1; value >= 0; value--) {
        if (better(prior[value]!, running.cost)) running = { cost: prior[value]!, value };
        best[value] = running;
      }
      for (let value = 0; value < values; value++) {
        // A higher previous priority always orders the pair; an equal one only when the tie rule does.
        const strict = value + 1 < values ? best[value + 1]! : { cost: [INF, INF] as Cost, value: -1 };
        const choice = tie && better(prior[value]!, strict.cost) ? { cost: prior[value]!, value } : strict;
        const mine = own(value + TARS_PRIORITY_MIN);
        rowCost.push([choice.cost[0] + mine[0], choice.cost[1] + mine[1]]);
        rowFrom.push(choice.value);
      }
    }
    cost.push(rowCost);
    from.push(rowFrom);
  });
  const last = cost[cost.length - 1]!;
  let end = -1;
  for (let value = 0; value < values; value++) if (last[value]![0] !== INF && (end < 0 || better(last[value]!, last[end]!))) end = value;
  if (end < 0) return { ok: false, reason: "noRoom" };
  const assigned: number[] = new Array(desired.length);
  for (let index = desired.length - 1, value = end; index >= 0; index--) {
    assigned[index] = value + TARS_PRIORITY_MIN;
    value = from[index]![value]!;
  }
  const changes = desired.flatMap((row, index) => assigned[index] !== row.priority || row === target ? [{ id: row.id, priority: assigned[index]! }] : []);
  changes.sort((a, b) => (a.id === target.id ? -1 : b.id === target.id ? 1 : 0));
  return { ok: true, changes };
}

/**
 * The move a drop asks for: the dragged queued work placed before (`top`) or
 * after (`bottom`) the row it was dropped on, as the queued work it then sits
 * directly after (later) or before (earlier). Null when it would not move.
 */
export function tarsQueueDropMove(queue: readonly TarsQueueRow[], sourceId: string, targetId: string, edge: "top" | "bottom" | null): TarsQueueMove | null {
  const order = [...queue].sort(compareTarsQueue);
  const from = order.findIndex((row) => row.id === sourceId);
  const onto = order.findIndex((row) => row.id === targetId);
  if (from < 0 || onto < 0 || from === onto) return null;
  // Where it lands once taken out of the list.
  const insert = onto + (edge === "bottom" ? 1 : 0);
  const landing = insert > from ? insert - 1 : insert;
  if (landing === from) return null;
  return { direction: landing < from ? "earlier" : "later", relativeTo: order[landing]!.id };
}
