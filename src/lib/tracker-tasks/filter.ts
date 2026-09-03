import type {
  TrackerPriorityLevel,
  TrackerSourceId,
  TrackerStatusCategory,
  TrackerTask,
  TrackerTaskListItem,
} from "@/lib/tracker-tasks/types";

/**
 * Tabs across the top of the tracker list.
 *
 * These are saved views rather than a second filter axis: each one answers a
 * different question ("what is on my plate", "what did I just finish"), so the
 * chips below the tabs stay orthogonal and keep their meaning when the tab
 * changes.
 */
export const TRACKER_TASK_VIEWS = [
  "assigned-open",
  "all-open",
  "recently-done",
  "in-stave",
] as const;
export type TrackerTaskView = (typeof TRACKER_TASK_VIEWS)[number];

/** Whether a row already has, or has never had, a Stave run attached. */
export type TrackerTaskLinkedFilter = "any" | "linked" | "unlinked";

/**
 * One filter state.
 *
 * Every array field means "no constraint" when empty rather than "match
 * nothing". That inversion is the whole reason a cleared chip row shows the
 * full list instead of an empty one, and it lets `countActiveTrackerTaskFilters`
 * be a plain count of non-empty dimensions.
 */
export interface TrackerTaskFilter {
  view: TrackerTaskView;
  sources: TrackerSourceId[];
  statusCategories: TrackerStatusCategory[];
  priorities: TrackerPriorityLevel[];
  projectKeys: string[];
  labels: string[];
  linked: TrackerTaskLinkedFilter;
  query: string;
}

export interface TrackerTaskFilterOptions {
  now: Date;
  /**
   * Ids the signed-in person is known by, per source.
   *
   * Optional because `assigned-open` is already an assignee query on the
   * source side; this is only a defensive refinement for a source that
   * over-returns. See `matchesView`.
   */
  currentUserIds?: readonly string[];
}

/** Status buckets that mean "there is nothing left to do here". */
const FINISHED_STATUS_CATEGORIES: ReadonlySet<TrackerStatusCategory> =
  new Set<TrackerStatusCategory>(["done", "closed"]);

/**
 * How far back `recently-done` looks.
 *
 * Two weeks covers "what did I ship this sprint" without turning the view into
 * an archive that has to paginate.
 */
export const RECENTLY_DONE_WINDOW_DAYS = 14;
const RECENTLY_DONE_WINDOW_MS = RECENTLY_DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Frozen empty array reused for every "no constraint" field.
 *
 * `TrackerTaskFilter` declares mutable arrays because the toolbar builds a
 * filter by assignment, so this is the one spot where that mutability is
 * asserted away: the shared default must not be an array a caller can push
 * into and thereby edit the default for everyone else.
 */
function frozenEmptyArray<T>(): T[] {
  return Object.freeze([]) as unknown as T[];
}

const EMPTY_SOURCES = frozenEmptyArray<TrackerSourceId>();
const EMPTY_STATUS_CATEGORIES = frozenEmptyArray<TrackerStatusCategory>();
const EMPTY_PRIORITIES = frozenEmptyArray<TrackerPriorityLevel>();
const EMPTY_STRINGS = frozenEmptyArray<string>();

/**
 * Shared "nothing selected" filter.
 *
 * Frozen, including the arrays, so it can be handed to a memoized consumer as a
 * stable identity without a caller's `push` quietly editing the default for
 * everyone else.
 */
export const DEFAULT_TRACKER_TASK_FILTER: TrackerTaskFilter = Object.freeze({
  view: "assigned-open" as TrackerTaskView,
  sources: EMPTY_SOURCES,
  statusCategories: EMPTY_STATUS_CATEGORIES,
  priorities: EMPTY_PRIORITIES,
  projectKeys: EMPTY_STRINGS,
  labels: EMPTY_STRINGS,
  linked: "any" as TrackerTaskLinkedFilter,
  query: "",
});

/** A fresh, mutable filter for `view`. Switching tabs clears the chips. */
export function createTrackerTaskFilter(
  view: TrackerTaskView,
): TrackerTaskFilter {
  return {
    view,
    sources: [],
    statusCategories: [],
    priorities: [],
    projectKeys: [],
    labels: [],
    linked: "any",
    query: "",
  };
}

/**
 * The value the Project chip filters on.
 *
 * A ticket may carry a project, a team, both, or neither, and the two trackers
 * disagree about which is the primary grouping. Exporting one rule keeps the
 * chip list and the predicate from drifting apart, which is the classic way a
 * filter ends up selecting a chip that matches zero rows.
 */
export function projectFilterKeyForTask(task: TrackerTask): string {
  return task.project?.id ?? task.team?.key ?? "";
}

/** Display label for `projectFilterKeyForTask`. */
export function projectFilterLabelForTask(task: TrackerTask): string {
  return task.project?.name ?? task.team?.name ?? "No project";
}

/**
 * How many chips the Reset button would clear.
 *
 * The view is excluded on purpose: it is a tab, not a chip, and Reset must not
 * bounce someone out of the list they are reading.
 */
export function countActiveTrackerTaskFilters(
  filter: TrackerTaskFilter,
): number {
  let count = 0;
  if (filter.sources.length > 0) count += 1;
  if (filter.statusCategories.length > 0) count += 1;
  if (filter.priorities.length > 0) count += 1;
  if (filter.projectKeys.length > 0) count += 1;
  if (filter.labels.length > 0) count += 1;
  if (filter.linked !== "any") count += 1;
  if (filter.query.trim().length > 0) count += 1;
  return count;
}

/**
 * A search box entry, split into the parts that can short-circuit.
 *
 * `exactKey` and `labelToken` exist because those two spellings are what people
 * actually type: a key pasted from a chat message, and `#label` copied from the
 * chip row. Recognising them avoids a substring sweep over every title and, more
 * importantly, avoids the false positives that sweep would produce — typing
 * `PLAT-2` should not surface `PLAT-24` or a title that merely mentions it.
 */
interface ParsedTrackerTaskQuery {
  exactKey: string | null;
  labelToken: string | null;
  text: string;
}

/** `ABC-123`, the shape every supported tracker prints a key in. */
const EXACT_KEY_PATTERN = /^[a-z][a-z0-9_]*-\d+$/i;

function parseTrackerTaskQuery(raw: string): ParsedTrackerTaskQuery | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (EXACT_KEY_PATTERN.test(trimmed)) {
    return { exactKey: trimmed.toLowerCase(), labelToken: null, text: "" };
  }
  if (trimmed.startsWith("#")) {
    const rest = trimmed.slice(1);
    const separator = rest.search(/\s/);
    const token = separator === -1 ? rest : rest.slice(0, separator);
    // A bare "#" is someone mid-typing, not a label constraint.
    if (token.length > 0) {
      const remainder =
        separator === -1 ? "" : rest.slice(separator + 1).trim();
      return {
        exactKey: null,
        labelToken: token.toLowerCase(),
        text: remainder.toLowerCase(),
      };
    }
  }
  return { exactKey: null, labelToken: null, text: trimmed.toLowerCase() };
}

function matchesLabelToken(task: TrackerTask, token: string): boolean {
  for (const label of task.labels) {
    if (label.name.toLowerCase().includes(token)) {
      return true;
    }
  }
  return false;
}

function matchesFreeText(task: TrackerTask, text: string): boolean {
  if (task.key.toLowerCase().includes(text)) return true;
  if (task.title.toLowerCase().includes(text)) return true;
  if (task.project && task.project.name.toLowerCase().includes(text)) {
    return true;
  }
  if (task.team && task.team.name.toLowerCase().includes(text)) return true;
  return matchesLabelToken(task, text);
}

function matchesQuery(
  task: TrackerTask,
  query: ParsedTrackerTaskQuery,
): boolean {
  if (query.exactKey !== null) {
    return task.key.toLowerCase() === query.exactKey;
  }
  if (query.labelToken !== null && !matchesLabelToken(task, query.labelToken)) {
    return false;
  }
  if (query.text.length === 0) {
    return true;
  }
  return matchesFreeText(task, query.text);
}

function matchesView(
  item: TrackerTaskListItem,
  view: TrackerTaskView,
  nowMs: number,
  recentlyDoneCutoffMs: number,
  currentUserIds: ReadonlySet<string> | null,
): boolean {
  const { task } = item;
  const finished = FINISHED_STATUS_CATEGORIES.has(task.status.category);
  switch (view) {
    case "assigned-open": {
      // Each source already queries for the signed-in person's tickets, so the
      // only thing left for the client to decide is whether the work is still
      // live. `currentUserIds` is applied only when the caller supplies it, as
      // a guard against a source that ignores the assignee filter; a ticket
      // with no assignee stays visible because "mine and unassigned" is what
      // the sources return.
      if (finished) return false;
      if (currentUserIds && task.assignee) {
        return currentUserIds.has(task.assignee.id);
      }
      return true;
    }
    case "all-open":
      return !finished;
    case "recently-done": {
      if (!finished) return false;
      // `closedAt` is the honest timestamp, but not every tracker sets it, so
      // fall back to the last edit rather than dropping the row entirely.
      const stamp = Date.parse(task.closedAt ?? task.updatedAt);
      if (Number.isNaN(stamp)) return false;
      return stamp >= recentlyDoneCutoffMs && stamp <= nowMs;
    }
    case "in-stave":
      return item.staveLinks.length > 0;
  }
}

/**
 * Apply a filter to a page of rows.
 *
 * Pure and stable in input order: the caller sorts and groups afterwards, so
 * reordering here would silently override that. When nothing is dropped the
 * input array is returned unchanged, which keeps a memoized consumer from
 * re-rendering on every refresh that changed nothing.
 */
export function filterTrackerTasks(
  items: TrackerTaskListItem[],
  filter: TrackerTaskFilter,
  options: TrackerTaskFilterOptions,
): TrackerTaskListItem[] {
  const nowMs = options.now.getTime();
  const recentlyDoneCutoffMs = nowMs - RECENTLY_DONE_WINDOW_MS;

  // Sets are built once per call rather than per row: these lists are short,
  // but the row count is not, and `includes` on every row is the difference
  // between a scroll that keeps up and one that does not.
  const sourceSet = filter.sources.length > 0 ? new Set(filter.sources) : null;
  const statusSet =
    filter.statusCategories.length > 0
      ? new Set(filter.statusCategories)
      : null;
  const prioritySet =
    filter.priorities.length > 0 ? new Set(filter.priorities) : null;
  const projectSet =
    filter.projectKeys.length > 0 ? new Set(filter.projectKeys) : null;
  const labelSet =
    filter.labels.length > 0
      ? new Set(filter.labels.map((label) => label.toLowerCase()))
      : null;
  const currentUserIds =
    options.currentUserIds && options.currentUserIds.length > 0
      ? new Set(options.currentUserIds)
      : null;
  const query = parseTrackerTaskQuery(filter.query);

  const result: TrackerTaskListItem[] = [];
  for (const item of items) {
    const { task } = item;
    if (
      !matchesView(
        item,
        filter.view,
        nowMs,
        recentlyDoneCutoffMs,
        currentUserIds,
      )
    ) {
      continue;
    }
    if (sourceSet && !sourceSet.has(task.source)) continue;
    if (statusSet && !statusSet.has(task.status.category)) continue;
    if (prioritySet && !prioritySet.has(task.priority.level)) continue;
    if (projectSet && !projectSet.has(projectFilterKeyForTask(task))) continue;
    if (labelSet) {
      let hit = false;
      for (const label of task.labels) {
        if (labelSet.has(label.name.toLowerCase())) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
    }
    if (filter.linked === "linked" && item.staveLinks.length === 0) continue;
    if (filter.linked === "unlinked" && item.staveLinks.length > 0) continue;
    if (query && !matchesQuery(task, query)) continue;
    result.push(item);
  }
  return result.length === items.length ? items : result;
}
