import { useMemo } from "react";

import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import {
  DEFAULT_TRACKER_ISSUE_FILTER,
  TRACKER_ISSUE_VIEWS,
  filterTrackerIssues,
  projectFilterKeyForTask,
  projectFilterLabelForTask,
  type TrackerIssueFilter,
  type TrackerIssueView,
} from "@/lib/tracker-issues/filter";
import {
  groupTrackerIssues,
  type TrackerIssueGroup,
  type TrackerIssueGroupMode,
} from "@/lib/tracker-issues/group";
import { sortTrackerIssues, type TrackerIssueSort } from "@/lib/tracker-issues/sort";
import type {
  TrackerIssueListItem,
  TrackerIssueStaveLink,
} from "@/lib/tracker-issues/types";
import type { TrackerIssueFilterOption } from "./TrackerIssueFilterChip";

export interface TrackerIssueListPipeline {
  /** Rows with the freshest link set folded in, before filtering. */
  items: TrackerIssueListItem[];
  groups: TrackerIssueGroup[];
  /** Visible row keys in display order, for keyboard movement. */
  orderedKeys: string[];
  viewCounts: Record<TrackerIssueView, number>;
  projectOptions: TrackerIssueFilterOption[];
  labelOptions: TrackerIssueFilterOption[];
}

/**
 * Everything the list derives from the cache mirror plus the toolbar state.
 *
 * Kept out of the store on purpose: these values depend on the filter and on
 * `now`, neither of which a push channel knows about, so computing them there
 * would redo the whole list on every unrelated push and hand the view a fresh
 * array identity each time. Kept out of the view so the derivation is readable
 * without the markup.
 */
export function useTrackerIssueListPipeline(args: {
  allItems: readonly TrackerIssueListItem[];
  /** Links pushed since the last list read, keyed by `trackerIssueKey`. */
  linksByKey: Record<string, TrackerIssueStaveLink[]>;
  filter: TrackerIssueFilter;
  group: TrackerIssueGroupMode;
  sort: TrackerIssueSort;
  collapsedGroupIds: readonly string[];
  now: Date;
}): TrackerIssueListPipeline {
  const { allItems, collapsedGroupIds, filter, group, linksByKey, now, sort } =
    args;

  /**
   * `staveLinks` on a cached row is only as fresh as the last list read, while
   * `linksByKey` also carries kickoffs pushed since. Without this fold, a ticket
   * just kicked off would be missing from the "In Stave" view it now belongs to.
   */
  const items = useMemo(
    () =>
      allItems.map((item) => {
        const links = linksByKey[trackerIssueKey(item.task.source, item.task.ref)];
        return links && links !== item.staveLinks
          ? ({ task: item.task, staveLinks: links } satisfies TrackerIssueListItem)
          : item;
      }),
    [allItems, linksByKey],
  );

  // Tab counts use each view's own predicate with no chips applied, so an empty
  // tab is visible before it is opened rather than after.
  const viewCounts = useMemo(() => {
    const counts = {} as Record<TrackerIssueView, number>;
    for (const view of TRACKER_ISSUE_VIEWS) {
      counts[view] = filterTrackerIssues(
        items,
        { ...DEFAULT_TRACKER_ISSUE_FILTER, view },
        { now },
      ).length;
    }
    return counts;
  }, [items, now]);

  const groups = useMemo(
    () =>
      groupTrackerIssues(
        sortTrackerIssues(filterTrackerIssues(items, filter, { now }), sort),
        group,
        { now },
      ),
    [filter, group, items, now, sort],
  );

  const orderedKeys = useMemo(
    () =>
      groups.flatMap((entry) =>
        collapsedGroupIds.includes(entry.id)
          ? []
          : entry.items.map((item) =>
              trackerIssueKey(item.task.source, item.task.ref),
            ),
      ),
    [collapsedGroupIds, groups],
  );

  // Chip options come from every loaded row, not the filtered set: options that
  // disappeared as soon as they were picked would make the chip unusable.
  const projectOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const item of items) {
      const key = projectFilterKeyForTask(item.task);
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, { label: projectFilterLabelForTask(item.task), count: 1 });
      }
    }
    return [...byKey.entries()]
      .map(([value, entry]) => ({ value, ...entry }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const labelOptions = useMemo(() => {
    const byName = new Map<string, number>();
    for (const item of items) {
      for (const label of item.task.labels) {
        byName.set(label.name, (byName.get(label.name) ?? 0) + 1);
      }
    }
    // Most-used first: a long label list is more useful ordered by how much of
    // the list each one would actually narrow.
    return [...byName.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [items]);

  return { items, groups, orderedKeys, viewCounts, projectOptions, labelOptions };
}
