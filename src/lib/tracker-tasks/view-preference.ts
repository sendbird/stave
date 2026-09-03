import {
  TRACKER_TASK_VIEWS,
  type TrackerTaskView,
} from "@/lib/tracker-tasks/filter";
import {
  TRACKER_TASK_GROUP_MODES,
  type TrackerTaskGroupMode,
} from "@/lib/tracker-tasks/group";
import {
  TRACKER_TASK_SORTS,
  type TrackerTaskSort,
} from "@/lib/tracker-tasks/sort";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
} from "@/lib/tracker-tasks/types";

/**
 * Where the list remembers how you left it.
 *
 * `localStorage` rather than app settings: this is view state, not a
 * preference worth syncing or exporting, and losing it costs one click.
 */
export const TRACKER_TASKS_VIEW_PREFERENCE_STORAGE_KEY =
  "stave.tracker-tasks.view";

export interface TrackerTasksViewPreference {
  view: TrackerTaskView;
  group: TrackerTaskGroupMode;
  sort: TrackerTaskSort;
  sources: TrackerSourceId[];
}

export const DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE: TrackerTasksViewPreference =
  Object.freeze({
    view: "assigned-open" as TrackerTaskView,
    group: "status" as TrackerTaskGroupMode,
    sort: "priority" as TrackerTaskSort,
    // Frozen so the shared default cannot be edited through a caller's
    // reference; every parse below hands back its own array.
    sources: Object.freeze([]) as unknown as TrackerSourceId[],
  });

function pickOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Read stored view state, salvaging field by field.
 *
 * A build that adds a sort mode and then gets rolled back leaves one unknown
 * string behind; that must not also throw away the source selection someone
 * configured. Unknown fields are ignored rather than rejected for the same
 * reason. Never throws — a corrupt value is a cleared view, not a blank screen.
 */
export function parseTrackerTasksViewPreference(
  raw: string | null,
): TrackerTasksViewPreference {
  if (raw === null || raw.length === 0) {
    return { ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE, sources: [] };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE, sources: [] };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE, sources: [] };
  }
  const record = decoded as Record<string, unknown>;
  const sources: TrackerSourceId[] = [];
  if (Array.isArray(record.sources)) {
    for (const entry of record.sources) {
      if (
        typeof entry === "string" &&
        (TRACKER_SOURCE_IDS as readonly string[]).includes(entry) &&
        !sources.includes(entry as TrackerSourceId)
      ) {
        sources.push(entry as TrackerSourceId);
      }
    }
  }
  return {
    view: pickOneOf(
      record.view,
      TRACKER_TASK_VIEWS,
      DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE.view,
    ),
    group: pickOneOf(
      record.group,
      TRACKER_TASK_GROUP_MODES,
      DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE.group,
    ),
    sort: pickOneOf(
      record.sort,
      TRACKER_TASK_SORTS,
      DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE.sort,
    ),
    sources,
  };
}

export function serializeTrackerTasksViewPreference(
  value: TrackerTasksViewPreference,
): string {
  return JSON.stringify({
    view: value.view,
    group: value.group,
    sort: value.sort,
    sources: value.sources,
  });
}

/**
 * The two functions above stay string-in/string-out so they are testable
 * without a DOM. These wrappers are the only place storage is touched, and both
 * swallow failures: `localStorage` throws in a private-mode window and when the
 * quota is full, neither of which is worth taking the list down for.
 */
export function readTrackerTasksViewPreference(): TrackerTasksViewPreference {
  try {
    return parseTrackerTasksViewPreference(
      globalThis.localStorage?.getItem(
        TRACKER_TASKS_VIEW_PREFERENCE_STORAGE_KEY,
      ) ?? null,
    );
  } catch {
    return { ...DEFAULT_TRACKER_TASKS_VIEW_PREFERENCE, sources: [] };
  }
}

export function writeTrackerTasksViewPreference(
  value: TrackerTasksViewPreference,
): void {
  try {
    globalThis.localStorage?.setItem(
      TRACKER_TASKS_VIEW_PREFERENCE_STORAGE_KEY,
      serializeTrackerTasksViewPreference(value),
    );
  } catch {
    // View state is disposable; a storage failure must not surface as an error.
  }
}
