import {
  trackerSourceRank,
  type TrackerPriorityLevel,
  type TrackerTaskListItem,
} from "@/lib/tracker-tasks/types";

export const TRACKER_TASK_SORTS = [
  "priority",
  "due",
  "updated",
  "key",
] as const;
export type TrackerTaskSort = (typeof TRACKER_TASK_SORTS)[number];

/** Urgent first. Lower rank sorts earlier. */
const PRIORITY_RANK: Record<TrackerPriorityLevel, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

const DUE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIGIT_PREFIX = /^\d/;

/**
 * Sort weight for a due date, with "no due date" pushed to the end.
 *
 * `YYYY-MM-DD` compares correctly as a string, but a numeric key keeps the
 * missing case from needing a separate branch in every comparator. Timezone is
 * irrelevant here: this value is only ever compared against another one built
 * the same way.
 */
function dueSortKey(dueDate: string | null): number {
  if (dueDate === null) {
    return Number.POSITIVE_INFINITY;
  }
  const match = DUE_DATE_PATTERN.exec(dueDate);
  if (!match) {
    return Number.POSITIVE_INFINITY;
  }
  return Number(match[1]) * 10_000 + Number(match[2]) * 100 + Number(match[3]);
}

function updatedSortKey(iso: string): number {
  const parsed = Date.parse(iso);
  // An unparseable timestamp sorts oldest rather than throwing the whole list
  // into a non-deterministic order.
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Compare two ticket keys the way a person reads them.
 *
 * Plain string order puts `ABC-10` before `ABC-9`, which looks like the list
 * lost track of the numbering. Chunking digits and comparing them numerically
 * fixes that without depending on `localeCompare`, whose result varies with the
 * host locale and would make the final tiebreak machine-dependent.
 *
 * Case is only ever a last resort. Comparing it inside a chunk would let
 * `abc-` versus `ABC-` outrank the number that follows, so two spellings of the
 * same prefix would no longer sort their tickets in numeric order.
 */
export function compareTrackerKeys(a: string, b: string): number {
  const chunkPattern = /(\d+|\D+)/g;
  const left = a.match(chunkPattern) ?? [];
  const right = b.match(chunkPattern) ?? [];
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const leftChunk = left[index] ?? "";
    const rightChunk = right[index] ?? "";
    const leftIsDigits = DIGIT_PREFIX.test(leftChunk);
    const rightIsDigits = DIGIT_PREFIX.test(rightChunk);
    if (leftIsDigits && rightIsDigits) {
      const difference = Number(leftChunk) - Number(rightChunk);
      if (difference !== 0) {
        return difference < 0 ? -1 : 1;
      }
      continue;
    }
    const leftLower = leftChunk.toLowerCase();
    const rightLower = rightChunk.toLowerCase();
    if (leftLower !== rightLower) {
      return leftLower < rightLower ? -1 : 1;
    }
  }
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  // Case-insensitively identical: fall back to raw order so `a` and `A` still
  // have a stable, repeatable relationship.
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Final tiebreak for every sort.
 *
 * `(source, key)` is unique across the merged list, so two rows can never
 * compare equal. Without it the order of equal-priority rows would depend on
 * the merge order of the source responses, and the list would visibly reshuffle
 * on every refresh even though nothing changed.
 */
function compareBySourceThenKey(
  a: TrackerTaskListItem,
  b: TrackerTaskListItem,
): number {
  if (a.task.source !== b.task.source) {
    return trackerSourceRank(a.task.source) - trackerSourceRank(b.task.source);
  }
  return compareTrackerKeys(a.task.key, b.task.key);
}

export function compareTrackerTasks(
  sort: TrackerTaskSort,
): (a: TrackerTaskListItem, b: TrackerTaskListItem) => number {
  switch (sort) {
    case "priority":
      return (a, b) => {
        const difference =
          PRIORITY_RANK[a.task.priority.level] -
          PRIORITY_RANK[b.task.priority.level];
        return difference !== 0 ? difference : compareBySourceThenKey(a, b);
      };
    case "due":
      return (a, b) => {
        const left = dueSortKey(a.task.dueDate);
        const right = dueSortKey(b.task.dueDate);
        // Both undated: `Infinity - Infinity` is NaN, so short-circuit before
        // subtracting instead of handing NaN to the sort.
        if (left !== right) {
          return left < right ? -1 : 1;
        }
        return compareBySourceThenKey(a, b);
      };
    case "updated":
      return (a, b) => {
        const left = updatedSortKey(a.task.updatedAt);
        const right = updatedSortKey(b.task.updatedAt);
        if (left !== right) {
          return left > right ? -1 : 1;
        }
        return compareBySourceThenKey(a, b);
      };
    case "key":
      return (a, b) => {
        const difference = compareTrackerKeys(a.task.key, b.task.key);
        return difference !== 0 ? difference : compareBySourceThenKey(a, b);
      };
  }
}

/** Sort a copy, so a cached list held elsewhere is never reordered in place. */
export function sortTrackerTasks(
  items: TrackerTaskListItem[],
  sort: TrackerTaskSort,
): TrackerTaskListItem[] {
  return [...items].sort(compareTrackerTasks(sort));
}
