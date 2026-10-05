import { i18n, useTranslation } from "@/i18n";
import { trackerVisualStyles } from "./tracker-visual.styles";
import type { RefObject } from "react";
import { LayoutGrid, LayoutList, Search, X } from "lucide-react";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  TRACKER_ISSUE_VIEWS,
  countActiveTrackerIssueFilters,
  createTrackerIssueFilter,
  type TrackerIssueFilter,
  type TrackerIssueLinkedFilter,
  type TrackerIssueView,
} from "@/lib/tracker-issues/filter";
import {
  TRACKER_ISSUE_GROUP_MODES,
  type TrackerIssueGroupMode,
} from "@/lib/tracker-issues/group";
import type { TrackerIssueLayout } from "@/lib/tracker-issues/layout";
import {
  TRACKER_ISSUE_SORTS,
  type TrackerIssueSort,
} from "@/lib/tracker-issues/sort";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
} from "@/lib/tracker-issues/presentation";
import {
  TRACKER_PRIORITY_LEVELS,
  TRACKER_SOURCE_IDS,
  TRACKER_STATUS_CATEGORIES,
  type TrackerPriorityLevel,
  type TrackerSourceId,
  type TrackerStatusCategory,
} from "@/lib/tracker-issues/types";
import { sx } from "@/components/ads/utils/stylex";
import {
  TrackerIssueFilterChip,
  type TrackerIssueFilterOption,
} from "./TrackerIssueFilterChip";
import { TRACKER_SOURCE_LABELS } from "./tracker-issue-ui";
import { taskLayoutStyles } from "./issues-layout.stylex";

const VIEW_LABELS: Record<TrackerIssueView, string> = {
  get "assigned-open"() { return i18n.t("issues:issuesToolbar.assignedToMe"); },
  get "all-open"() { return i18n.t("issues:issuesToolbar.allOpen"); },
  get "recently-done"() { return i18n.t("issues:issuesToolbar.recentlyDone"); },
  get "in-stave"() { return i18n.t("issues:issuesToolbar.inStave"); },
};

const GROUP_LABELS: Record<TrackerIssueGroupMode, string> = {
  get status() { return i18n.t("issues:issuesToolbar.groupStatus"); },
  get due() { return i18n.t("issues:issuesToolbar.groupDueDate"); },
};

const SORT_LABELS: Record<TrackerIssueSort, string> = {
  get priority() { return i18n.t("issues:issuesToolbar.sortPriority"); },
  get due() { return i18n.t("issues:issuesToolbar.sortDueDate"); },
  get updated() { return i18n.t("issues:issuesToolbar.sortUpdated"); },
  get key() { return i18n.t("issues:issuesToolbar.sortKey"); },
};

const LINKED_LABELS: Record<TrackerIssueLinkedFilter, string> = {
  get any() { return i18n.t("issues:issuesToolbar.any"); },
  get linked() { return i18n.t("issues:issuesToolbar.inStave"); },
  get unlinked() { return i18n.t("issues:issuesToolbar.notInStave"); },
};

const SOURCE_OPTIONS: TrackerIssueFilterOption[] = TRACKER_SOURCE_IDS.map(
  (source) => ({ value: source, label: TRACKER_SOURCE_LABELS[source] }),
);

const STATUS_OPTIONS: TrackerIssueFilterOption[] = TRACKER_STATUS_CATEGORIES.map(
  (category) => ({
    value: category,
    label: TRACKER_STATUS_PRESENTATION[category].label,
  }),
);

// Urgent first, so the chip list reads in the same order as the sorted list.
const PRIORITY_OPTIONS: TrackerIssueFilterOption[] = [...TRACKER_PRIORITY_LEVELS]
  .reverse()
  .map((level) => ({
    value: level,
    label: TRACKER_PRIORITY_PRESENTATION[level].label,
  }));

export interface IssuesToolbarProps {
  filter: TrackerIssueFilter;
  onFilterChange: (filter: TrackerIssueFilter) => void;
  group: TrackerIssueGroupMode;
  onGroupChange: (group: TrackerIssueGroupMode) => void;
  sort: TrackerIssueSort;
  onSortChange: (sort: TrackerIssueSort) => void;
  layout: TrackerIssueLayout;
  onLayoutChange: (layout: TrackerIssueLayout) => void;
  /** Derived from the loaded rows by the view, not from settings. */
  projectOptions: readonly TrackerIssueFilterOption[];
  labelOptions: readonly TrackerIssueFilterOption[];
  /** Row counts per view tab, so an empty tab is visible before it is opened. */
  viewCounts: Record<TrackerIssueView, number>;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export function IssuesToolbar(props: IssuesToolbarProps) {
  const { t: tI18n } = useTranslation(["issues"]);
  const { filter } = props;
  const activeFilterCount = countActiveTrackerIssueFilters(filter);

  const patch = (changes: Partial<TrackerIssueFilter>) => {
    props.onFilterChange({ ...filter, ...changes });
  };

  return (
    <div className={sx(taskLayoutStyles.toolbar)}>
      <div className={sx(taskLayoutStyles.toolbarRow)}>
        <div
          className={sx(taskLayoutStyles.tabList)}
          role="tablist"
          aria-label={tI18n("issues:issuesToolbar.trackerIssueViews")}
        >
          {TRACKER_ISSUE_VIEWS.map((view) => {
            const selected = filter.view === view;
            return (
              <Button
                key={view}
                type="button"
                size="sm"
                role="tab"
                aria-selected={selected}
                variant={selected ? "secondary" : "ghost"}
                xstyle={[
                  taskLayoutStyles.tab,
                  selected && taskLayoutStyles.activeTab,
                ]}
                // Switching tabs starts a clean filter: the chips answer a
                // different question in each view, and carrying them across is
                // how a tab looks broken on arrival.
                onClick={() => props.onFilterChange(createTrackerIssueFilter(view))}
              >
                {VIEW_LABELS[view]}
                <span className={sx(trackerVisualStyles.count)}>
                  {props.viewCounts[view]}
                </span>
              </Button>
            );
          })}
        </div>

        <div className={sx(taskLayoutStyles.search)}>
          <Search className={sx(taskLayoutStyles.searchIcon)} />
          <Input
            ref={props.searchInputRef}
            value={filter.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder={tI18n("issues:issuesToolbar.searchKeyTitleLabel")}
            aria-label={tI18n("issues:issuesToolbar.searchTrackerTickets")}
            xstyle={taskLayoutStyles.searchInput}
          />
        </div>
      </div>

      <div className={sx(taskLayoutStyles.toolbarRow)}>
        <TrackerIssueFilterChip
          label={tI18n("issues:issuesToolbar.source")}
          searchable={false}
          options={SOURCE_OPTIONS}
          selected={filter.sources}
          onChange={(next) => patch({ sources: next as TrackerSourceId[] })}
        />
        <TrackerIssueFilterChip
          label={tI18n("issues:issuesToolbar.status")}
          searchable={false}
          options={STATUS_OPTIONS}
          selected={filter.statusCategories}
          onChange={(next) =>
            patch({ statusCategories: next as TrackerStatusCategory[] })
          }
        />
        <TrackerIssueFilterChip
          label={tI18n("issues:issuesToolbar.priority")}
          searchable={false}
          options={PRIORITY_OPTIONS}
          selected={filter.priorities}
          onChange={(next) =>
            patch({ priorities: next as TrackerPriorityLevel[] })
          }
        />
        <TrackerIssueFilterChip
          label={tI18n("issues:issuesToolbar.project")}
          options={props.projectOptions}
          selected={filter.projectKeys}
          onChange={(next) => patch({ projectKeys: next })}
          emptyMessage={tI18n("issues:issuesToolbar.noProjectsOnTheLoadedTickets")}
        />
        <TrackerIssueFilterChip
          label={tI18n("issues:issuesToolbar.label")}
          options={props.labelOptions}
          selected={filter.labels}
          onChange={(next) => patch({ labels: next })}
          emptyMessage={tI18n("issues:issuesToolbar.noLabelsOnTheLoadedTickets")}
        />

        <Select
          value={filter.linked}
          onValueChange={(value) =>
            patch({ linked: value as TrackerIssueLinkedFilter })
          }
        >
          <SelectTrigger
            className={sx(taskLayoutStyles.selectShort)}
            aria-label={tI18n("issues:issuesToolbar.filterByStaveRuns")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LINKED_LABELS) as TrackerIssueLinkedFilter[]).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {LINKED_LABELS[value]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <div className={sx(taskLayoutStyles.toolbarActions)}>
          <div
            className={sx(taskLayoutStyles.segmented)}
            role="group"
            aria-label={tI18n("issues:issuesToolbar.ticketLayout")}
          >
            <Button
              type="button"
              size="sm"
              variant={props.layout === "list" ? "secondary" : "ghost"}
              aria-pressed={props.layout === "list"}
              xstyle={taskLayoutStyles.tab}
              onClick={() => props.onLayoutChange("list")}
            >
              <LayoutList className={sx(trackerVisualStyles.icon)} />
              {tI18n("issues:issuesToolbar.list")}</Button>
            <Button
              type="button"
              size="sm"
              variant={props.layout === "board" ? "secondary" : "ghost"}
              aria-pressed={props.layout === "board"}
              xstyle={taskLayoutStyles.tab}
              onClick={() => props.onLayoutChange("board")}
            >
              <LayoutGrid className={sx(trackerVisualStyles.icon)} />
              {tI18n("issues:issuesToolbar.board")}</Button>
          </div>
          {props.layout === "list" ? (
            <Select
              value={props.group}
              onValueChange={(value) =>
                props.onGroupChange(value as TrackerIssueGroupMode)
              }
            >
              <SelectTrigger
                className={sx(taskLayoutStyles.selectMedium)}
                aria-label={tI18n("issues:issuesToolbar.groupTickets")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKER_ISSUE_GROUP_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {GROUP_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={props.sort}
            onValueChange={(value) =>
              props.onSortChange(value as TrackerIssueSort)
            }
          >
            <SelectTrigger
              className={sx(taskLayoutStyles.selectMedium)}
              aria-label={tI18n("issues:issuesToolbar.sortTickets")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_ISSUE_SORTS.map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeFilterCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={taskLayoutStyles.tab}
              // The view is preserved: Reset clears chips, it does not bounce
              // the reader out of the list they are in.
              onClick={() =>
                props.onFilterChange(createTrackerIssueFilter(filter.view))
              }
            >
              <X className={sx(trackerVisualStyles.icon)} />
              {tI18n("issues:issuesToolbar.resetCount", { count: activeFilterCount })}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
