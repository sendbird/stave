import {
  trackerVisualStyles,
  priorityToneStyles,
  labelColorStyles,
} from "./tracker-visual.styles";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { memo } from "react";

import { Badge } from "../../ads/components/Badge";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import { groupTrackerTasksForBoard } from "@/lib/tracker-tasks/board";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  getInitials,
  resolveTrackerLabelColor,
} from "@/lib/tracker-tasks/presentation";
import type { TrackerTaskListItem } from "@/lib/tracker-tasks/types";
import { trackerTaskKey } from "@/lib/tracker-tasks/client-store";
import {
  TRACKER_PRIORITY_ICONS,
  TRACKER_SOURCE_LABELS,
} from "./tracker-task-ui";
import { taskLayoutStyles } from "./tasks-layout.stylex";

const VISIBLE_LABEL_COUNT = 2;

export interface TasksBoardProps {
  items: readonly TrackerTaskListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

/**
 * Status-column board following the ADS Board composition, with Stave tokens.
 *
 * Cards open the shared peek. There is no `onCardMove`: Tasks does not write
 * tracker status, so a drag would only pretend to.
 */
export function TasksBoard(props: TasksBoardProps) {
  const columns = groupTrackerTasksForBoard(props.items);

  return (
    <div data-stave-tasks-board="" className={sx(taskLayoutStyles.board)}>
      {columns.map((column) => {
        const tone = TRACKER_STATUS_PRESENTATION[column.id];
        return (
          <section
            key={column.id}
            data-board-column={column.id}
            className={sx(taskLayoutStyles.boardColumn)}
          >
            <header className={sx(taskLayoutStyles.boardHeader)}>
              <h3 className={sx(taskLayoutStyles.boardTitle)}>
                {column.title}
              </h3>
              <Badge variant="outline" tone={tone.tone}>
                {column.items.length}
              </Badge>
            </header>
            <div className={sx(taskLayoutStyles.boardItems)}>
              {column.items.map((item) => {
                const key = trackerTaskKey(item.task.source, item.task.ref);
                return (
                  <TasksBoardCard
                    key={key}
                    item={item}
                    selected={props.selectedKey === key}
                    onSelect={props.onSelect}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const TasksBoardCard = memo(function TasksBoardCard(props: {
  item: TrackerTaskListItem;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const { task } = props.item;
  const key = trackerTaskKey(task.source, task.ref);
  const priority = TRACKER_PRIORITY_PRESENTATION[task.priority.level];
  const PriorityIcon = TRACKER_PRIORITY_ICONS[priority.iconName];
  const hiddenLabelCount = Math.max(
    0,
    task.labels.length - VISIBLE_LABEL_COUNT,
  );
  const initials = task.assignee ? getInitials(task.assignee.name) : null;

  return (
    <AdsButton
      layout="host"
      type="button"
      data-tracker-task-key={key}
      aria-pressed={props.selected}
      onClick={() => props.onSelect(key)}
      xstyle={[
        taskLayoutStyles.boardCard,
        focusRing.ring,
        transition.colors,
        props.selected && taskLayoutStyles.boardCardSelected,
      ]}
    >
      <div className={sx(taskLayoutStyles.boardCardTop)}>
        <span className={sx(taskLayoutStyles.boardCardKeyGroup)}>
          <span title={TRACKER_SOURCE_LABELS[task.source]}>
            <ServiceLinkIcon
              kind={task.source === "crane" ? "crane" : "jira"}
              className={sx(taskLayoutStyles.boardCardKey)}
            />
          </span>
          <span className={sx(taskLayoutStyles.boardCardKey)}>{task.key}</span>
        </span>
        <span
          className={sx(priorityToneStyles[priority.tone])}
          title={priority.label}
        >
          <PriorityIcon
            className={sx(trackerVisualStyles.priorityIcon)}
            aria-label={priority.label}
          />
        </span>
      </div>
      <span className={sx(taskLayoutStyles.boardCardTitle)}>{task.title}</span>
      <div className={sx(taskLayoutStyles.boardCardFooter)}>
        <span className={sx(taskLayoutStyles.boardLabels)}>
          {task.labels.slice(0, VISIBLE_LABEL_COUNT).map((label) => {
            const color = resolveTrackerLabelColor(label.color);
            return (
              <span
                key={label.name}
                className={sx(taskLayoutStyles.boardLabel)}
              >
                {color === null ? null : (
                  <span
                    aria-hidden="true"
                    className={sx(
                      taskLayoutStyles.labelDot,
                      color.kind === "token" && labelColorStyles[color.token],
                    )}
                    style={
                      color.kind === "css"
                        ? { backgroundColor: color.value }
                        : undefined
                    }
                  />
                )}
                {label.name}
              </span>
            );
          })}
          {hiddenLabelCount > 0 ? (
            <span className={sx(taskLayoutStyles.boardCardKey)}>
              +{hiddenLabelCount}
            </span>
          ) : null}
        </span>
        {initials ? (
          <span
            className={sx(taskLayoutStyles.boardAvatar)}
            title={task.assignee?.name}
          >
            {initials}
          </span>
        ) : null}
      </div>
    </AdsButton>
  );
});
