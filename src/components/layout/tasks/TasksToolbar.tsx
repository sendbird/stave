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
  TRACKER_TASK_VIEWS,
  countActiveTrackerTaskFilters,
  createTrackerTaskFilter,
  type TrackerTaskFilter,
  type TrackerTaskLinkedFilter,
  type TrackerTaskView,
} from "@/lib/tracker-tasks/filter";
import {
  TRACKER_TASK_GROUP_MODES,
  type TrackerTaskGroupMode,
} from "@/lib/tracker-tasks/group";
import type { TrackerTaskLayout } from "@/lib/tracker-tasks/layout";
import {
  TRACKER_TASK_SORTS,
  type TrackerTaskSort,
} from "@/lib/tracker-tasks/sort";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
} from "@/lib/tracker-tasks/presentation";
import {
  TRACKER_PRIORITY_LEVELS,
  TRACKER_SOURCE_IDS,
  TRACKER_STATUS_CATEGORIES,
  type TrackerPriorityLevel,
  type TrackerSourceId,
  type TrackerStatusCategory,
} from "@/lib/tracker-tasks/types";
import { sx } from "@/components/ads/utils/stylex";
import {
  TrackerTaskFilterChip,
  type TrackerTaskFilterOption,
} from "./TrackerTaskFilterChip";
import { TRACKER_SOURCE_LABELS } from "./tracker-task-ui";
import { taskLayoutStyles } from "./tasks-layout.stylex";

const VIEW_LABELS: Record<TrackerTaskView, string> = {
  "assigned-open": "Assigned to me",
  "all-open": "All open",
  "recently-done": "Recently done",
  "in-stave": "In Stave",
};

const GROUP_LABELS: Record<TrackerTaskGroupMode, string> = {
  status: "Group: Status",
  due: "Group: Due date",
};

const SORT_LABELS: Record<TrackerTaskSort, string> = {
  priority: "Sort: Priority",
  due: "Sort: Due date",
  updated: "Sort: Updated",
  key: "Sort: Key",
};

const LINKED_LABELS: Record<TrackerTaskLinkedFilter, string> = {
  any: "Any",
  linked: "In Stave",
  unlinked: "Not in Stave",
};

const SOURCE_OPTIONS: TrackerTaskFilterOption[] = TRACKER_SOURCE_IDS.map(
  (source) => ({ value: source, label: TRACKER_SOURCE_LABELS[source] }),
);

const STATUS_OPTIONS: TrackerTaskFilterOption[] = TRACKER_STATUS_CATEGORIES.map(
  (category) => ({
    value: category,
    label: TRACKER_STATUS_PRESENTATION[category].label,
  }),
);

// Urgent first, so the chip list reads in the same order as the sorted list.
const PRIORITY_OPTIONS: TrackerTaskFilterOption[] = [...TRACKER_PRIORITY_LEVELS]
  .reverse()
  .map((level) => ({
    value: level,
    label: TRACKER_PRIORITY_PRESENTATION[level].label,
  }));

export interface TasksToolbarProps {
  filter: TrackerTaskFilter;
  onFilterChange: (filter: TrackerTaskFilter) => void;
  group: TrackerTaskGroupMode;
  onGroupChange: (group: TrackerTaskGroupMode) => void;
  sort: TrackerTaskSort;
  onSortChange: (sort: TrackerTaskSort) => void;
  layout: TrackerTaskLayout;
  onLayoutChange: (layout: TrackerTaskLayout) => void;
  /** Derived from the loaded rows by the view, not from settings. */
  projectOptions: readonly TrackerTaskFilterOption[];
  labelOptions: readonly TrackerTaskFilterOption[];
  /** Row counts per view tab, so an empty tab is visible before it is opened. */
  viewCounts: Record<TrackerTaskView, number>;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export function TasksToolbar(props: TasksToolbarProps) {
  const { filter } = props;
  const activeFilterCount = countActiveTrackerTaskFilters(filter);

  const patch = (changes: Partial<TrackerTaskFilter>) => {
    props.onFilterChange({ ...filter, ...changes });
  };

  return (
    <div className={sx(taskLayoutStyles.toolbar)}>
      <div className={sx(taskLayoutStyles.toolbarRow)}>
        <div
          className={sx(taskLayoutStyles.tabList)}
          role="tablist"
          aria-label="Tracker task views"
        >
          {TRACKER_TASK_VIEWS.map((view) => (
            <Button
              key={view}
              type="button"
              size="sm"
              role="tab"
              aria-selected={filter.view === view}
              variant={filter.view === view ? "secondary" : "ghost"}
              xstyle={[
                taskLayoutStyles.tab,
                filter.view === view && taskLayoutStyles.activeTab,
              ]}
              // Switching tabs starts a clean filter: the chips answer a
              // different question in each view, and carrying them across is
              // how a tab looks broken on arrival.
              onClick={() =>
                props.onFilterChange(createTrackerTaskFilter(view))
              }
            >
              {VIEW_LABELS[view]}
              <span className={sx(trackerVisualStyles.count)}>
                {props.viewCounts[view]}
              </span>
            </Button>
          ))}
        </div>

        <div className={sx(taskLayoutStyles.search)}>
          <Search className={sx(taskLayoutStyles.searchIcon)} />
          <Input
            ref={props.searchInputRef}
            value={filter.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="Search key, title, #label"
            aria-label="Search tracker tickets"
            xstyle={taskLayoutStyles.searchInput}
          />
        </div>
      </div>

      <div className={sx(taskLayoutStyles.toolbarRow)}>
        <TrackerTaskFilterChip
          label="Source"
          searchable={false}
          options={SOURCE_OPTIONS}
          selected={filter.sources}
          onChange={(next) => patch({ sources: next as TrackerSourceId[] })}
        />
        <TrackerTaskFilterChip
          label="Status"
          searchable={false}
          options={STATUS_OPTIONS}
          selected={filter.statusCategories}
          onChange={(next) =>
            patch({ statusCategories: next as TrackerStatusCategory[] })
          }
        />
        <TrackerTaskFilterChip
          label="Priority"
          searchable={false}
          options={PRIORITY_OPTIONS}
          selected={filter.priorities}
          onChange={(next) =>
            patch({ priorities: next as TrackerPriorityLevel[] })
          }
        />
        <TrackerTaskFilterChip
          label="Project"
          options={props.projectOptions}
          selected={filter.projectKeys}
          onChange={(next) => patch({ projectKeys: next })}
          emptyMessage="No projects on the loaded tickets."
        />
        <TrackerTaskFilterChip
          label="Label"
          options={props.labelOptions}
          selected={filter.labels}
          onChange={(next) => patch({ labels: next })}
          emptyMessage="No labels on the loaded tickets."
        />

        <Select
          value={filter.linked}
          onValueChange={(value) =>
            patch({ linked: value as TrackerTaskLinkedFilter })
          }
        >
          <SelectTrigger
            className={sx(taskLayoutStyles.selectShort)}
            aria-label="Filter by Stave runs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LINKED_LABELS) as TrackerTaskLinkedFilter[]).map(
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
            aria-label="Ticket layout"
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
              List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={props.layout === "board" ? "secondary" : "ghost"}
              aria-pressed={props.layout === "board"}
              xstyle={taskLayoutStyles.tab}
              onClick={() => props.onLayoutChange("board")}
            >
              <LayoutGrid className={sx(trackerVisualStyles.icon)} />
              Board
            </Button>
          </div>
          {props.layout === "list" ? (
            <Select
              value={props.group}
              onValueChange={(value) =>
                props.onGroupChange(value as TrackerTaskGroupMode)
              }
            >
              <SelectTrigger
                className={sx(taskLayoutStyles.selectMedium)}
                aria-label="Group tickets"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKER_TASK_GROUP_MODES.map((mode) => (
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
              props.onSortChange(value as TrackerTaskSort)
            }
          >
            <SelectTrigger
              className={sx(taskLayoutStyles.selectMedium)}
              aria-label="Sort tickets"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_TASK_SORTS.map((sort) => (
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
                props.onFilterChange(createTrackerTaskFilter(filter.view))
              }
            >
              <X className={sx(trackerVisualStyles.icon)} />
              Reset {activeFilterCount}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
