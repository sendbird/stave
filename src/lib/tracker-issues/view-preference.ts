import {
  TRACKER_ISSUE_VIEWS,
  type TrackerIssueView,
} from "@/lib/tracker-issues/filter";
import {
  TRACKER_ISSUE_GROUP_MODES,
  type TrackerIssueGroupMode,
} from "@/lib/tracker-issues/group";
import {
  TRACKER_ISSUE_LAYOUTS,
  type TrackerIssueLayout,
} from "@/lib/tracker-issues/layout";
import {
  parseTrackerIssuesPeekWidth,
  TRACKER_ISSUES_PEEK_DEFAULT_PX,
} from "@/lib/tracker-issues/peek-size";
import {
  TRACKER_ISSUE_SORTS,
  type TrackerIssueSort,
} from "@/lib/tracker-issues/sort";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
} from "@/lib/tracker-issues/types";

/**
 * Where the list remembers how you left it.
 *
 * `localStorage` rather than app settings: this is view state, not a
 * preference worth syncing or exporting, and losing it costs one click.
 */
export const TRACKER_ISSUES_VIEW_PREFERENCE_STORAGE_KEY =
  "stave.tracker-issues.view";

export interface TrackerIssuesViewPreference {
  view: TrackerIssueView;
  group: TrackerIssueGroupMode;
  sort: TrackerIssueSort;
  sources: TrackerSourceId[];
  layout: TrackerIssueLayout;
  /** Last dragged peek width, already clamped. */
  peekWidth: number;
}

export const DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE: TrackerIssuesViewPreference =
  Object.freeze({
    view: "assigned-open" as TrackerIssueView,
    group: "status" as TrackerIssueGroupMode,
    sort: "priority" as TrackerIssueSort,
    // Frozen so the shared default cannot be edited through a caller's
    // reference; every parse below hands back its own array.
    sources: Object.freeze([]) as unknown as TrackerSourceId[],
    layout: "list" as TrackerIssueLayout,
    peekWidth: TRACKER_ISSUES_PEEK_DEFAULT_PX,
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
export function parseTrackerIssuesViewPreference(
  raw: string | null,
): TrackerIssuesViewPreference {
  if (raw === null || raw.length === 0) {
    return { ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE, sources: [] };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE, sources: [] };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE, sources: [] };
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
      TRACKER_ISSUE_VIEWS,
      DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE.view,
    ),
    group: pickOneOf(
      record.group,
      TRACKER_ISSUE_GROUP_MODES,
      DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE.group,
    ),
    sort: pickOneOf(
      record.sort,
      TRACKER_ISSUE_SORTS,
      DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE.sort,
    ),
    sources,
    layout: pickOneOf(
      record.layout,
      TRACKER_ISSUE_LAYOUTS,
      DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE.layout,
    ),
    peekWidth: parseTrackerIssuesPeekWidth(record.peekWidth),
  };
}

export function serializeTrackerIssuesViewPreference(
  value: TrackerIssuesViewPreference,
): string {
  return JSON.stringify({
    view: value.view,
    group: value.group,
    sort: value.sort,
    sources: value.sources,
    layout: value.layout,
    peekWidth: parseTrackerIssuesPeekWidth(value.peekWidth),
  });
}

/**
 * The two functions above stay string-in/string-out so they are testable
 * without a DOM. These wrappers are the only place storage is touched, and both
 * swallow failures: `localStorage` throws in a private-mode window and when the
 * quota is full, neither of which is worth taking the list down for.
 */
export function readTrackerIssuesViewPreference(): TrackerIssuesViewPreference {
  try {
    return parseTrackerIssuesViewPreference(
      globalThis.localStorage?.getItem(
        TRACKER_ISSUES_VIEW_PREFERENCE_STORAGE_KEY,
      ) ?? null,
    );
  } catch {
    return { ...DEFAULT_TRACKER_ISSUES_VIEW_PREFERENCE, sources: [] };
  }
}

export function writeTrackerIssuesViewPreference(
  value: TrackerIssuesViewPreference,
): void {
  try {
    globalThis.localStorage?.setItem(
      TRACKER_ISSUES_VIEW_PREFERENCE_STORAGE_KEY,
      serializeTrackerIssuesViewPreference(value),
    );
  } catch {
    // View state is disposable; a storage failure must not surface as an error.
  }
}
