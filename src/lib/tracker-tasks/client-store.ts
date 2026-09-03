import { formatTrackerDue } from "@/lib/tracker-tasks/presentation";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
  type TrackerSourceSyncStatus,
  type TrackerTaskDetail,
  type TrackerTaskListItem,
  type TrackerTaskStaveLink,
  type TrackerTasksPublicStatus,
} from "@/lib/tracker-tasks/types";

/**
 * Renderer-side mirror of the main-process tracker cache.
 *
 * This module stores *only* what main pushed, keyed for lookup. Filtering,
 * grouping and sorting stay in the view's `useMemo` because they depend on the
 * toolbar state and on `now`, neither of which the push channels know about:
 * computing them here would redo the whole list on every unrelated push and
 * hand the view a fresh array identity each time.
 */
export interface TrackerTasksAttention {
  overdue: number;
  dueToday: number;
}

export interface TrackerTasksClientSnapshot {
  /** False until the first `list` reply lands, so the view can show a skeleton. */
  ready: boolean;
  itemsBySource: Record<TrackerSourceId, TrackerTaskListItem[]>;
  allItems: TrackerTaskListItem[];
  /** Keyed by `trackerTaskKey(source, task.ref)`. */
  itemByKey: Record<string, TrackerTaskListItem>;
  syncBySource: Record<TrackerSourceId, TrackerSourceSyncStatus | null>;
  linksByKey: Record<string, TrackerTaskStaveLink[]>;
  detailByKey: Record<string, TrackerTaskDetail>;
  attention: TrackerTasksAttention;
  lastPublishedAt: number;
}

/**
 * Frozen shared empties. The snapshot fields are typed mutable because
 * `filterTrackerTasks` and friends take mutable arrays, so freezing is the only
 * thing stopping a caller from pushing into a container everyone else holds.
 */
function frozenEmptyArray<T>(): T[] {
  return Object.freeze([]) as unknown as T[];
}

export const EMPTY_TRACKER_TASK_ITEMS = frozenEmptyArray<TrackerTaskListItem>();
export const EMPTY_TRACKER_TASK_LINKS =
  frozenEmptyArray<TrackerTaskStaveLink>();

export function trackerTaskKey(
  source: TrackerSourceId,
  taskRef: string,
): string {
  return `${source}:${taskRef}`;
}

export function parseTrackerTaskKey(
  key: string,
): { source: TrackerSourceId; taskRef: string } | null {
  // Source ids never contain a colon, so the first one is always the divider;
  // a tracker ref is free to contain more.
  const separator = key.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const source = key.slice(0, separator) as TrackerSourceId;
  if (!TRACKER_SOURCE_IDS.includes(source)) {
    return null;
  }
  const taskRef = key.slice(separator + 1);
  return taskRef ? { source, taskRef } : null;
}

interface TrackerTasksStoreState {
  ready: boolean;
  itemsBySource: Record<TrackerSourceId, TrackerTaskListItem[]>;
  syncBySource: Record<TrackerSourceId, TrackerSourceSyncStatus | null>;
  /**
   * Links delivered by `onKickoffUpdated` ahead of the list refresh that will
   * eventually carry them, so a run started from a ticket badges its row now.
   */
  pushedLinksByKey: Record<string, TrackerTaskStaveLink[]>;
  detailByKey: Record<string, TrackerTaskDetail>;
}

function createBySource<T>(value: T): Record<TrackerSourceId, T> {
  return TRACKER_SOURCE_IDS.reduce(
    (result, source) => {
      result[source] = value;
      return result;
    },
    {} as Record<TrackerSourceId, T>,
  );
}

function createInitialState(): TrackerTasksStoreState {
  return {
    ready: false,
    itemsBySource: createBySource<TrackerTaskListItem[]>(
      EMPTY_TRACKER_TASK_ITEMS,
    ),
    syncBySource: createBySource<TrackerSourceSyncStatus | null>(null),
    pushedLinksByKey: {},
    detailByKey: {},
  };
}

const FINISHED_CATEGORIES = new Set(["done", "closed"]);

function mergeLinks(
  cached: readonly TrackerTaskStaveLink[],
  pushed: readonly TrackerTaskStaveLink[] | undefined,
): TrackerTaskStaveLink[] {
  if (!pushed || pushed.length === 0) {
    return cached as TrackerTaskStaveLink[];
  }
  const byId = new Map<string, TrackerTaskStaveLink>();
  for (const link of cached) {
    byId.set(link.id, link);
  }
  // Pushed wins: it is strictly newer than whatever the cache round-tripped.
  for (const link of pushed) {
    byId.set(link.id, link);
  }
  return [...byId.values()];
}

function buildSnapshot(
  next: TrackerTasksStoreState,
  now: Date,
  previousAttention?: TrackerTasksAttention,
): TrackerTasksClientSnapshot {
  const allItems: TrackerTaskListItem[] = [];
  const itemByKey: Record<string, TrackerTaskListItem> = {};
  const linksByKey: Record<string, TrackerTaskStaveLink[]> = {};
  let overdue = 0;
  let dueToday = 0;

  for (const source of TRACKER_SOURCE_IDS) {
    for (const item of next.itemsBySource[source]) {
      const key = trackerTaskKey(item.task.source, item.task.ref);
      allItems.push(item);
      itemByKey[key] = item;
      linksByKey[key] = mergeLinks(item.staveLinks, next.pushedLinksByKey[key]);
      if (FINISHED_CATEGORIES.has(item.task.status.category)) {
        continue;
      }
      const due = formatTrackerDue(item.task.dueDate, now);
      if (due?.tone === "overdue") {
        overdue += 1;
      } else if (due?.tone === "today") {
        dueToday += 1;
      }
    }
  }

  // A link pushed for a ticket the cache has not seen yet still has to be
  // readable, otherwise the row that triggered the kickoff loses its badge.
  for (const [key, links] of Object.entries(next.pushedLinksByKey)) {
    if (!linksByKey[key]) {
      linksByKey[key] = links;
    }
  }

  return Object.freeze({
    ready: next.ready,
    itemsBySource: Object.freeze({ ...next.itemsBySource }),
    allItems,
    itemByKey,
    syncBySource: Object.freeze({ ...next.syncBySource }),
    linksByKey,
    detailByKey: next.detailByKey,
    // Reused when the counts did not move, so the top-bar badge does not
    // re-render on every cache push that changed something it does not show.
    attention:
      previousAttention &&
      previousAttention.overdue === overdue &&
      previousAttention.dueToday === dueToday
        ? previousAttention
        : Object.freeze({ overdue, dueToday }),
    lastPublishedAt: now.getTime(),
  });
}

let state = createInitialState();
let snapshot = buildSnapshot(state, new Date());
const listeners = new Set<() => void>();

/**
 * Rebuild and notify. Callers decide *before* calling this that something
 * actually changed: `useSyncExternalStore` compares snapshots by identity, so
 * publishing a structurally identical snapshot re-renders every subscriber for
 * nothing and, on a list this long, drops frames.
 */
function publish(next: TrackerTasksStoreState) {
  state = next;
  snapshot = buildSnapshot(state, new Date(), snapshot.attention);
  for (const listener of listeners) {
    listener();
  }
}

export function getTrackerTasksClientSnapshot(): TrackerTasksClientSnapshot {
  return snapshot;
}

export function subscribeTrackerTasksClient(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset; the app never tears the mirror down. */
export function resetTrackerTasksClientStore() {
  state = createInitialState();
  snapshot = buildSnapshot(state, new Date());
  for (const listener of listeners) {
    listener();
  }
}

function sameSyncStatus(
  a: TrackerSourceSyncStatus | null,
  b: TrackerSourceSyncStatus | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.availability === b.availability &&
    a.syncing === b.syncing &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.lastErrorCode === b.lastErrorCode &&
    a.taskCount === b.taskCount &&
    a.truncated === b.truncated
  );
}

export function applyTrackerTasksStatus(status: TrackerTasksPublicStatus) {
  const syncBySource = { ...state.syncBySource };
  let changed = false;
  for (const entry of status.sources) {
    if (!sameSyncStatus(state.syncBySource[entry.source], entry)) {
      syncBySource[entry.source] = entry;
      changed = true;
    }
  }
  if (changed) {
    publish({ ...state, syncBySource });
  }
}

/**
 * Cheap structural comparison for a replaced page of rows. A deep compare would
 * cost more than the re-render it avoids; `ref` plus `updatedAt` plus the link
 * count catches every change the main process can make to a cached row.
 */
function sameItems(
  a: readonly TrackerTaskListItem[],
  b: readonly TrackerTaskListItem[],
): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      !left ||
      !right ||
      left.task.ref !== right.task.ref ||
      left.task.updatedAt !== right.task.updatedAt ||
      left.staveLinks.length !== right.staveLinks.length
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Replace the cached rows. `source` is omitted when the reply covered every
 * source, in which case a source that returned nothing must be emptied rather
 * than left showing stale rows.
 */
export function applyTrackerTaskItems(args: {
  source?: TrackerSourceId;
  items: TrackerTaskListItem[];
}) {
  const itemsBySource = { ...state.itemsBySource };
  let changed = !state.ready;

  if (args.source) {
    if (!sameItems(state.itemsBySource[args.source], args.items)) {
      itemsBySource[args.source] = args.items;
      changed = true;
    }
  } else {
    const grouped = createBySource<TrackerTaskListItem[]>(
      EMPTY_TRACKER_TASK_ITEMS,
    );
    for (const item of args.items) {
      const bucket = grouped[item.task.source];
      grouped[item.task.source] =
        bucket === EMPTY_TRACKER_TASK_ITEMS ? [item] : [...bucket, item];
    }
    for (const source of TRACKER_SOURCE_IDS) {
      if (!sameItems(state.itemsBySource[source], grouped[source])) {
        itemsBySource[source] = grouped[source];
        changed = true;
      }
    }
  }

  if (changed) {
    publish({ ...state, ready: true, itemsBySource });
  }
}

export function applyTrackerTaskStaveLink(link: TrackerTaskStaveLink) {
  const key = trackerTaskKey(link.source, link.taskRef);
  const existing = state.pushedLinksByKey[key] ?? EMPTY_TRACKER_TASK_LINKS;
  const previous = existing.find((candidate) => candidate.id === link.id);
  if (
    previous &&
    previous.state === link.state &&
    previous.updatedAt === link.updatedAt &&
    previous.staveTaskId === link.staveTaskId &&
    previous.errorCode === link.errorCode
  ) {
    return;
  }
  const nextLinks = previous
    ? existing.map((candidate) => (candidate.id === link.id ? link : candidate))
    : [...existing, link];
  publish({
    ...state,
    pushedLinksByKey: { ...state.pushedLinksByKey, [key]: nextLinks },
  });
}

export function applyTrackerTaskDetail(detail: TrackerTaskDetail) {
  const key = trackerTaskKey(detail.source, detail.ref);
  const existing = state.detailByKey[key];
  if (
    existing &&
    existing.updatedAt === detail.updatedAt &&
    existing.description === detail.description
  ) {
    return;
  }
  publish({ ...state, detailByKey: { ...state.detailByKey, [key]: detail } });
}
