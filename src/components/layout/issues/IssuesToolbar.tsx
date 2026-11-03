import { i18n, useTranslation } from "@/i18n";
import type { RefObject } from "react";
import { LayoutGrid, LayoutList, ListFilter, Search } from "lucide-react";

import { AppliedFilters } from "@/components/ads/components/AppliedFilters";
import { Button } from "@/components/ads/components/Button";
import {
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
import { sx } from "@/components/ads/utils/stylex";
import { CountBadge } from "@/components/system/CountBadge";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { SearchableMultiPicker } from "@/components/layout/settings-searchable-picker";
import {
  applyIssueFilterValues,
  clearIssueFilters,
  issueAppliedFilters,
  issueFilterPickerOptions,
  removeIssueAppliedFilter,
  selectedIssueFilterValues,
  type IssueAppliedFilter,
  type TrackerIssueFilterOption,
} from "./issue-filter-model";
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
  /** Row counts per view, so an empty view is visible before it is opened. */
  viewCounts: Record<TrackerIssueView, number>;
  /** Rows the current view and filters leave, announced as filters change. */
  resultCount: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The Issues toolbar: views and search, then one Filter list (every property's
 * values, searchable) beside the Stave-runs quick filter and the display
 * controls, then, while anything narrows the list, the applied filters as
 * removable chips with Clear all and a spoken result count.
 */
export function IssuesToolbar(props: IssuesToolbarProps) {
  const { t: tI18n } = useTranslation(["issues"]);
  const { filter } = props;
  const activeFilterCount = countActiveTrackerIssueFilters(filter);
  const selectedValues = selectedIssueFilterValues(filter);
  const chips = issueAppliedFilters({
    filter,
    projectOptions: props.projectOptions,
    labelOptions: props.labelOptions,
    linkedLabel: (linked) => LINKED_LABELS[linked],
  });

  const patch = (changes: Partial<TrackerIssueFilter>) => {
    props.onFilterChange({ ...filter, ...changes });
  };

  return (
    <div className={sx(taskLayoutStyles.toolbar)}>
      <div className={sx(taskLayoutStyles.toolbarRow)}>
        <SegmentedControl
          aria-label={tI18n("issues:issuesToolbar.trackerIssueViews")}
          density="regular"
          value={filter.view}
          // Switching views starts a clean filter: the filters answer a
          // different question in each view, and carrying them across is how
          // a view looks broken on arrival.
          onValueChange={(view) => props.onFilterChange(createTrackerIssueFilter(view))}
          options={TRACKER_ISSUE_VIEWS.map((view) => ({
            value: view,
            label: VIEW_LABELS[view],
            count: props.viewCounts[view],
          }))}
        />

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
        <SearchableMultiPicker
          trigger={<Button size="sm" variant={selectedValues.length > 0 ? "secondary" : "outline"} />}
          triggerContent={
            <>
              <ListFilter aria-hidden />
              {tI18n("issues:issuesToolbar.filter")}
              {selectedValues.length > 0 ? <CountBadge count={selectedValues.length} tone="neutral" /> : null}
            </>
          }
          aria-label={
            selectedValues.length > 0
              ? tI18n("issues:issuesToolbar.filterCount", { count: selectedValues.length })
              : tI18n("issues:issuesToolbar.filter")
          }
          options={issueFilterPickerOptions({
            projectOptions: props.projectOptions,
            labelOptions: props.labelOptions,
          })}
          selected={selectedValues}
          onChange={(values) => props.onFilterChange(applyIssueFilterValues(filter, values))}
          searchPlaceholder={tI18n("issues:issuesToolbar.searchFilterValues")}
          searchLabel={tI18n("issues:issuesToolbar.searchFilterValuesLabel")}
          emptyText={tI18n("issues:issuesToolbar.noFilterValues")}
          popupXstyle={taskLayoutStyles.filterPopup}
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
          <SegmentedControl
            aria-label={tI18n("issues:issuesToolbar.ticketLayout")}
            density="regular"
            value={props.layout}
            onValueChange={props.onLayoutChange}
            options={[
              { value: "list", label: tI18n("issues:issuesToolbar.list"), icon: <LayoutList aria-hidden /> },
              { value: "board", label: tI18n("issues:issuesToolbar.board"), icon: <LayoutGrid aria-hidden /> },
            ]}
          />
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
        </div>
      </div>

      {/*
        The applied filters start their own row at the inline start, so Clear
        all sits with the chips it clears instead of at the end of a wrapped
        line of display controls. The count stays mounted so every change is
        announced, not only the first one.
      */}
      <div className={sx(taskLayoutStyles.appliedRow, activeFilterCount === 0 && taskLayoutStyles.appliedRowEmpty)}>
        {chips.length > 0 ? (
          <AppliedFilters
            xstyle={taskLayoutStyles.appliedChips}
            label={tI18n("issues:issuesToolbar.appliedFilters")}
            clearAllLabel={tI18n("issues:issuesToolbar.clearAll")}
            filters={chips}
            onRemove={(id) => props.onFilterChange(removeIssueAppliedFilter(filter, id as IssueAppliedFilter["id"]))}
            onClearAll={() => props.onFilterChange(clearIssueFilters(filter))}
          />
        ) : null}
        <span role="status" aria-live="polite" className={sx(taskLayoutStyles.appliedSummary)}>
          {activeFilterCount > 0
            ? tI18n("issues:issuesToolbar.resultSummary", {
                filters: tI18n("issues:issuesToolbar.filterTotal", { count: activeFilterCount }),
                count: props.resultCount,
              })
            : ""}
        </span>
      </div>
    </div>
  );
}
