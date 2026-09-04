import type { RefObject } from "react";
import { Search, X } from "lucide-react";

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
import { cn } from "@/lib/utils";
import {
  TrackerTaskFilterChip,
  type TrackerTaskFilterOption,
} from "./TrackerTaskFilterChip";
import { TRACKER_SOURCE_LABELS } from "./tracker-task-ui";

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
    <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 bg-background/85 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-0.5 rounded-md bg-muted/45 p-0.5"
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
              className={cn(
                "h-8 gap-1.5 px-2.5 text-xs",
                filter.view === view &&
                  "border-border/55 bg-background/85 shadow-[0_1px_2px_oklch(0_0_0/0.08)]",
              )}
              // Switching tabs starts a clean filter: the chips answer a
              // different question in each view, and carrying them across is
              // how a tab looks broken on arrival.
              onClick={() =>
                props.onFilterChange(createTrackerTaskFilter(view))
              }
            >
              {VIEW_LABELS[view]}
              <span className="tabular-nums text-muted-foreground">
                {props.viewCounts[view]}
              </span>
            </Button>
          ))}
        </div>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={props.searchInputRef}
            value={filter.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="Search key, title, #label"
            aria-label="Search tracker tickets"
            className="h-8 w-64 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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
            className="h-8 w-36 text-xs"
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

        <div className="ml-auto flex items-center gap-1.5">
          <Select
            value={props.group}
            onValueChange={(value) =>
              props.onGroupChange(value as TrackerTaskGroupMode)
            }
          >
            <SelectTrigger
              className="h-8 w-40 text-xs"
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
          <Select
            value={props.sort}
            onValueChange={(value) =>
              props.onSortChange(value as TrackerTaskSort)
            }
          >
            <SelectTrigger
              className="h-8 w-40 text-xs"
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
              className="h-8 gap-1 px-2.5 text-xs"
              // The view is preserved: Reset clears chips, it does not bounce
              // the reader out of the list they are in.
              onClick={() =>
                props.onFilterChange(createTrackerTaskFilter(filter.view))
              }
            >
              <X className="size-3.5" />
              Reset {activeFilterCount}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
