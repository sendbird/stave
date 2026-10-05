import { i18n, useTranslation } from "@/i18n";
import { trackerVisualStyles } from "./tracker-visual.styles";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GroupedVirtuoso } from "react-virtuoso";

import type { TrackerIssueGroup } from "@/lib/tracker-issues/group";
import type { TrackerIssueListItem } from "@/lib/tracker-issues/types";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { TrackerIssueRow, type TrackerIssueRowProps } from "./TrackerIssueRow";
import { taskLayoutStyles } from "./issues-layout.stylex";

/**
 * Row count above which the list virtualizes.
 *
 * Below it, plain DOM keeps sticky headers, keyboard focus and `scrollIntoView`
 * behaving exactly as written; above it, a few hundred rows of tracker tickets
 * are enough to cost frames on every filter keystroke.
 */
export const TRACKER_ISSUE_VIRTUALIZATION_THRESHOLD = 80;

type RowCallbacks = Pick<
  TrackerIssueRowProps,
  | "onSelect"
  | "onKickoff"
  | "onAttach"
  | "onOpenStaveTask"
  | "attachTargetLabel"
>;

export interface TrackerIssueListProps extends RowCallbacks {
  groups: TrackerIssueGroup[];
  now: Date;
  selectedKey: string | null;
  collapsedGroupIds: readonly string[];
  onToggleGroup: (groupId: string) => void;
}

function GroupHeader(props: {
  group: TrackerIssueGroup;
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
 * keyboard hook can find a row by its `data-tracker-issue-key` attribute without
 * knowing which path is active.
 */
export function TrackerIssueList(props: TrackerIssueListProps) {
  const { t: tI18n } = useTranslation(["issues"]);
  const collapsed = useMemo(
    () => new Set(props.collapsedGroupIds),
    [props.collapsedGroupIds, i18n.resolvedLanguage],
  );
  const visibleGroups = useMemo(
    () =>
      props.groups.map((group) => ({
        group,
        items: collapsed.has(group.id)
          ? ([] as TrackerIssueListItem[])
          : group.items,
      })),
    [collapsed, props.groups, i18n.resolvedLanguage],
  );
  const totalVisibleRows = visibleGroups.reduce(
    (total, entry) => total + entry.items.length,
    0,
  );
  const flatItems = useMemo(
    () => visibleGroups.flatMap((entry) => entry.items),
    [visibleGroups, i18n.resolvedLanguage],
  );

  const renderRow = (item: TrackerIssueListItem) => (
    <TrackerIssueRow
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

  if (totalVisibleRows > TRACKER_ISSUE_VIRTUALIZATION_THRESHOLD) {
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
      aria-label={tI18n("issues:trackerIssueList.trackerTickets")}
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
