import { memo } from "react";

import { Badge } from "@/components/ui";
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
import { cn } from "@/lib/utils";
import {
  TRACKER_PRIORITY_ICONS,
  TRACKER_SOURCE_LABELS,
} from "./tracker-task-ui";

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
    <div
      data-stave-tasks-board=""
      className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden px-4 py-3 [scrollbar-width:thin]"
    >
      {columns.map((column) => {
        const tone = TRACKER_STATUS_PRESENTATION[column.id];
        return (
          <section
            key={column.id}
            data-board-column={column.id}
            className="flex w-[17rem] shrink-0 flex-col rounded-lg border border-border/60 bg-muted/25"
          >
            <header className="flex shrink-0 items-center gap-2 px-3 py-2">
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {column.title}
              </h3>
              <Badge
                variant="outline"
                className={cn("tabular-nums text-xs", tone.toneClassName)}
              >
                {column.items.length}
              </Badge>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
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
    <button
      type="button"
      data-tracker-task-key={key}
      aria-pressed={props.selected}
      onClick={() => props.onSelect(key)}
      className={cn(
        "flex w-full flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
        props.selected
          ? "border-primary/40 bg-accent/50"
          : "border-border/70 bg-card hover:border-border hover:bg-accent/25",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span title={TRACKER_SOURCE_LABELS[task.source]}>
            <ServiceLinkIcon
              kind={task.source === "crane" ? "crane" : "jira"}
              className="text-[13px] text-muted-foreground"
            />
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {task.key}
          </span>
        </span>
        <span className={priority.toneClassName} title={priority.label}>
          <PriorityIcon className="size-4" aria-label={priority.label} />
        </span>
      </div>
      <span className="line-clamp-3 text-sm font-medium leading-5 text-foreground">
        {task.title}
      </span>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {task.labels.slice(0, VISIBLE_LABEL_COUNT).map((label) => {
            const color = resolveTrackerLabelColor(label.color);
            return (
              <span
                key={label.name}
                className="inline-flex max-w-[7rem] items-center gap-1 truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {color === null ? null : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      color.kind === "token" && color.className,
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
            <span className="text-xs text-muted-foreground">
              +{hiddenLabelCount}
            </span>
          ) : null}
        </span>
        {initials ? (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
            title={task.assignee?.name}
          >
            {initials}
          </span>
        ) : null}
      </div>
    </button>
  );
});
