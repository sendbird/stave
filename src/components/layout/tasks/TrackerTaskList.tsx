import { trackerVisualStyles } from "./tracker-visual.styles";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GroupedVirtuoso } from "react-virtuoso";

import type { TrackerTaskGroup } from "@/lib/tracker-tasks/group";
import type { TrackerTaskListItem } from "@/lib/tracker-tasks/types";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { TrackerTaskRow, type TrackerTaskRowProps } from "./TrackerTaskRow";
import { taskLayoutStyles } from "./tasks-layout.stylex";

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
    <AdsButton
      layout="host"
      type="button"
      onClick={props.onToggle}
      aria-expanded={!props.collapsed}
      xstyle={[taskLayoutStyles.listHeader, focusRing.ring, transition.colors]}
    >
      {props.collapsed ? (
        <ChevronRight className={sx(trackerVisualStyles.icon)} />
      ) : (
        <ChevronDown className={sx(trackerVisualStyles.icon)} />
      )}
      {props.group.label}
      <span className={sx(taskLayoutStyles.listCount)}>
        {props.group.items.length}
      </span>
    </AdsButton>
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
        className={sx(taskLayoutStyles.list)}
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
      className={sx(taskLayoutStyles.list)}
    >
      {visibleGroups.map((entry) => (
        <div key={entry.group.id}>
          <div className={sx(taskLayoutStyles.listGroup)}>
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
