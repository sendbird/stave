import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GroupedVirtuoso } from "react-virtuoso";

import type { TrackerTaskGroup } from "@/lib/tracker-tasks/group";
import type { TrackerTaskListItem } from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";
import { TrackerTaskRow, type TrackerTaskRowProps } from "./TrackerTaskRow";

/**
 * Row count above which the list virtualizes.
 *
 * Below it, plain DOM keeps sticky headers, keyboard focus and `scrollIntoView`
 * behaving exactly as written; above it, a few hundred rows of tracker tickets
 * are enough to cost frames on every filter keystroke.
 */
export const TRACKER_TASK_VIRTUALIZATION_THRESHOLD = 80;

type RowCallbacks = Pick<
  TrackerTaskRowProps,
  | "onSelect"
  | "onKickoff"
  | "onAttach"
  | "onOpenStaveTask"
  | "attachTargetLabel"
>;

export interface TrackerTaskListProps extends RowCallbacks {
  groups: TrackerTaskGroup[];
  now: Date;
  selectedKey: string | null;
  collapsedGroupIds: readonly string[];
  onToggleGroup: (groupId: string) => void;
}

function GroupHeader(props: {
  group: TrackerTaskGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-expanded={!props.collapsed}
      className="flex w-full items-center gap-1.5 border-b border-border/50 bg-background/95 px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur-sm hover:text-foreground"
    >
      {props.collapsed ? (
        <ChevronRight className="size-3.5" />
      ) : (
        <ChevronDown className="size-3.5" />
      )}
      {props.group.label}
      <span className="tabular-nums font-normal text-muted-foreground/80">
        {props.group.items.length}
      </span>
    </button>
  );
}

/**
 * Grouped ticket list with sticky, collapsible group headers.
 *
 * The two rendering paths deliberately produce the same DOM per row, so the
 * keyboard hook can find a row by its `data-tracker-task-key` attribute without
 * knowing which path is active.
 */
export function TrackerTaskList(props: TrackerTaskListProps) {
  const collapsed = useMemo(
    () => new Set(props.collapsedGroupIds),
    [props.collapsedGroupIds],
  );
  const visibleGroups = useMemo(
    () =>
      props.groups.map((group) => ({
        group,
        items: collapsed.has(group.id)
          ? ([] as TrackerTaskListItem[])
          : group.items,
      })),
    [collapsed, props.groups],
  );
  const totalVisibleRows = visibleGroups.reduce(
    (total, entry) => total + entry.items.length,
    0,
  );
  const flatItems = useMemo(
    () => visibleGroups.flatMap((entry) => entry.items),
    [visibleGroups],
  );

  const renderRow = (item: TrackerTaskListItem) => (
    <TrackerTaskRow
      key={`${item.task.source}:${item.task.ref}`}
      item={item}
      now={props.now}
      selected={props.selectedKey === `${item.task.source}:${item.task.ref}`}
      onSelect={props.onSelect}
      onKickoff={props.onKickoff}
      onAttach={props.onAttach}
      onOpenStaveTask={props.onOpenStaveTask}
      attachTargetLabel={props.attachTargetLabel}
    />
  );

  if (totalVisibleRows > TRACKER_TASK_VIRTUALIZATION_THRESHOLD) {
    return (
      <GroupedVirtuoso
        className={cn("h-full")}
        groupCounts={visibleGroups.map((entry) => entry.items.length)}
        groupContent={(index) => {
          const entry = visibleGroups[index];
          if (!entry) {
            return null;
          }
          return (
            <GroupHeader
              group={entry.group}
              collapsed={collapsed.has(entry.group.id)}
              onToggle={() => props.onToggleGroup(entry.group.id)}
            />
          );
        }}
        itemContent={(index) => {
          const item = flatItems[index];
          return item ? renderRow(item) : null;
        }}
      />
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Tracker tickets"
      className="h-full overflow-y-auto"
    >
      {visibleGroups.map((entry) => (
        <div key={entry.group.id}>
          <div className="sticky top-0 z-10">
            <GroupHeader
              group={entry.group}
              collapsed={collapsed.has(entry.group.id)}
              onToggle={() => props.onToggleGroup(entry.group.id)}
            />
          </div>
          {entry.items.map(renderRow)}
        </div>
      ))}
    </div>
  );
}
