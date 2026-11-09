import type { FleetBoardLayout } from "@/store/app-settings";
import { fleetSearchMatches, normalizeFleetSearchQuery } from "./card-task-rows";
import {
  fleetTaskRowSearchText,
  isTableOnlyFilter,
  matchesFleetTaskTableFilter,
  type FleetTaskRow,
  type FleetTaskTableFilter,
} from "./task-rows";
import { matchesFleetOwnerFilter, type FleetOwnerFilter, type FleetTaskOwner } from "./task-owner";

/** What narrows Fleet's board, the parts a focus request may reset. */
export interface FleetFocusView {
  filter: FleetTaskTableFilter;
  owner: FleetOwnerFilter;
  query: string;
  /** Repositories folded on the cards board. */
  collapsedRepositories: Readonly<Record<string, boolean>>;
}

/**
 * - `wait`: the target's task list is still being read; decide later.
 * - `waitWorkspace`: the target's workspace is not on the board yet (a Tars
 *   execution workspace the renderer has not loaded); wait a bounded time
 *   for it, then say so.
 * - `missing`: the task is not one Fleet shows (gone, closed, or its list
 *   could not be read); the request is dropped and nothing else changes.
 * - `show`: open this row, with only what hid it reset.
 */
export type FleetFocusResolution =
  | { kind: "wait" }
  | { kind: "waitWorkspace" }
  | { kind: "missing" }
  | { kind: "show"; taskKey: string; view: FleetFocusView };

/** How long a request waits for its workspace to appear before Fleet says it cannot show it. */
export const FLEET_FOCUS_WORKSPACE_WAIT_MS = 8_000;

/** The cards board narrows whole workspaces, the way a card decides it. */
function cardsShow(filter: FleetTaskTableFilter, row: FleetTaskRow, hasBlockingAttention: boolean) {
  const board = isTableOnlyFilter(filter) ? "active" : filter;
  switch (board) {
    case "all": return true;
    case "active": return row.workspaceActivity !== "dormant";
    case "running": return row.workspaceActivity === "live";
    case "blocked": return hasBlockingAttention;
  }
}

/**
 * Where a "show this task" request lands on the board, and the least change
 * to the filters that makes its row visible: a filter that hides the row
 * returns to Active (or All for a dormant workspace), an owner filter to
 * every owner, a search that misses it is cleared, and a folded repository
 * opens. Filters that do not hide the row are kept.
 */
export function resolveFleetFocus(args: {
  target: { workspaceId: string; taskId: string };
  layout: FleetBoardLayout;
  /** Whether the target's workspace is on the board at all. */
  workspaceKnown: boolean;
  /** The target workspace's rows, or null while its task list is still being read. */
  rows: readonly FleetTaskRow[] | null;
  /** The cards' blocked filter reads the workspace's blocking attention. */
  workspaceHasBlockingAttention: boolean;
  ownerOf: (row: FleetTaskRow) => FleetTaskOwner | null | undefined;
  view: FleetFocusView;
}): FleetFocusResolution {
  if (!args.workspaceKnown) return { kind: "waitWorkspace" };
  if (!args.rows) return { kind: "wait" };
  const row = args.rows.find((candidate) =>
    candidate.workspaceId === args.target.workspaceId && candidate.task.id === args.target.taskId);
  if (!row) return { kind: "missing" };
  const cards = args.layout === "cards";
  const view: FleetFocusView = { ...args.view };
  const shownBy = (filter: FleetTaskTableFilter) => cards
    ? cardsShow(filter, row, args.workspaceHasBlockingAttention)
    : matchesFleetTaskTableFilter(row, filter);
  if (!shownBy(view.filter)) view.filter = shownBy("active") ? "active" : "all";
  // Only the task-row layouts narrow by owner.
  if (!cards && !matchesFleetOwnerFilter(args.ownerOf(row), view.owner)) view.owner = "all";
  const query = normalizeFleetSearchQuery(view.query);
  // A card stays when any of its tasks matches; a row only for itself.
  const searched = cards ? args.rows : [row];
  if (query && !searched.some((candidate) => fleetSearchMatches(fleetTaskRowSearchText(candidate), query))) view.query = "";
  if (cards && view.collapsedRepositories[row.repositoryPath]) {
    view.collapsedRepositories = { ...view.collapsedRepositories, [row.repositoryPath]: false };
  }
  return { kind: "show", taskKey: row.key, view };
}

/**
 * One step of consuming a focus request. A request acts once: a handled id
 * is never applied again, a pending one waits without being marked handled,
 * and any settled outcome clears exactly that request, so a newer one that
 * replaced it is never swallowed. A workspace that has not appeared once the
 * wait ran out (`workspaceWaitOver`) settles it with a notice instead of
 * dropping it silently.
 */
export function stepFleetFocus(args: {
  request: { id: number } | null;
  handledId: number | null;
  workspaceWaitOver?: boolean;
  resolve: () => FleetFocusResolution;
}): {
  handledId: number | null;
  show: Extract<FleetFocusResolution, { kind: "show" }> | null;
  clearId: number | null;
  notice: "workspaceNotLoaded" | null;
} {
  const { request, handledId } = args;
  const idle = { handledId, show: null, clearId: null, notice: null };
  if (!request || request.id === handledId) return idle;
  const resolution = args.resolve();
  if (resolution.kind === "wait") return idle;
  if (resolution.kind === "waitWorkspace") {
    return args.workspaceWaitOver ? { handledId: request.id, show: null, clearId: request.id, notice: "workspaceNotLoaded" } : idle;
  }
  return { handledId: request.id, show: resolution.kind === "show" ? resolution : null, clearId: request.id, notice: null };
}
