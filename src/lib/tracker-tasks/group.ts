import type {
  TrackerStatusCategory,
  TrackerTaskListItem,
} from "@/lib/tracker-tasks/types";

export const TRACKER_TASK_GROUP_MODES = ["status", "due"] as const;
export type TrackerTaskGroupMode = (typeof TRACKER_TASK_GROUP_MODES)[number];

export interface TrackerTaskGroup {
  id: string;
  label: string;
  items: TrackerTaskListItem[];
}

/**
 * Reading order for status groups.
 *
 * Deliberately not the lifecycle order: what is moving comes first, what is
 * waiting on someone else comes second, and finished work sinks to the bottom
 * where it is still reachable but never in the way.
 */
const STATUS_GROUP_ORDER: readonly {
  id: TrackerStatusCategory;
  label: string;
}[] = [
  { id: "in_progress", label: "In progress" },
  { id: "in_review", label: "In review" },
  { id: "todo", label: "To do" },
  { id: "done", label: "Done" },
  { id: "closed", label: "Closed" },
];

const DUE_GROUP_ORDER: readonly { id: TrackerDueBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "none", label: "No due date" },
];

export type TrackerDueBucket =
  "overdue" | "today" | "this-week" | "later" | "none";

/** Local midnight of the calendar day `date` falls on. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const DUE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Read `YYYY-MM-DD` as local midnight.
 *
 * A tracker due date is a calendar date with no timezone attached: the ticket
 * is due "on the 4th" wherever you are. Parsing it with `Date.parse` would read
 * it as UTC midnight, which puts it on the 3rd for anyone west of Greenwich and
 * makes a due-today ticket render as overdue. Building a local date instead
 * keeps "today" meaning the user's today, which is also why every comparison
 * below is done on local day boundaries.
 */
export function parseLocalTrackerDueDate(dueDate: string): Date | null {
  const match = DUE_DATE_PATTERN.exec(dueDate);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  // Rejects "2024-02-31", which `Date` would happily roll into March.
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

/**
 * Last local day of the calendar week containing `now`, weeks starting Monday.
 *
 * "This week" is the calendar week rather than a rolling seven days so the
 * bucket shrinks as the week goes on and matches what a weekly plan means. On a
 * Sunday the bucket is therefore empty and everything future lands in "Later" —
 * intended, not a boundary bug.
 */
function endOfLocalWeek(now: Date): Date {
  const dayFromMonday = (now.getDay() + 6) % 7;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + (6 - dayFromMonday),
  );
}

export function trackerDueBucket(
  dueDate: string | null,
  now: Date,
): TrackerDueBucket {
  if (dueDate === null) {
    return "none";
  }
  const due = parseLocalTrackerDueDate(dueDate);
  if (!due) {
    return "none";
  }
  const dueMs = due.getTime();
  const todayMs = startOfLocalDay(now).getTime();
  if (dueMs < todayMs) return "overdue";
  if (dueMs === todayMs) return "today";
  return dueMs <= endOfLocalWeek(now).getTime() ? "this-week" : "later";
}

/**
 * Bucket rows for a section list.
 *
 * Input order is preserved inside every group because the caller has already
 * sorted; grouping is a partition, not a re-sort. Empty groups are dropped so
 * the list never shows a header with nothing under it.
 */
export function groupTrackerTasks(
  items: TrackerTaskListItem[],
  mode: TrackerTaskGroupMode,
  options: { now: Date },
): TrackerTaskGroup[] {
  const buckets = new Map<string, TrackerTaskListItem[]>();
  for (const item of items) {
    const id =
      mode === "status"
        ? item.task.status.category
        : trackerDueBucket(item.task.dueDate, options.now);
    const bucket = buckets.get(id);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(id, [item]);
    }
  }

  const order: readonly { id: string; label: string }[] =
    mode === "status" ? STATUS_GROUP_ORDER : DUE_GROUP_ORDER;
  const groups: TrackerTaskGroup[] = [];
  for (const entry of order) {
    const bucket = buckets.get(entry.id);
    if (bucket && bucket.length > 0) {
      groups.push({ id: entry.id, label: entry.label, items: bucket });
    }
  }
  return groups;
}
