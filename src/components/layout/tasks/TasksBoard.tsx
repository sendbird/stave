import { memo } from "react";
import { CornerDownRight, ExternalLink, GitBranch, Link2 } from "lucide-react";

import { Board } from "@/components/ads/components/Board";
import {
  StateIcon,
  PriorityIcon,
  type WorkflowState,
} from "@/components/ads/components/WorkflowIcon";
import { Badge } from "@/components/ads/components/Badge";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Skeleton } from "@/components/ads/components/Skeleton";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import { groupTrackerTasksForBoard } from "@/lib/tracker-tasks/board";
import { trackerTaskKey } from "@/lib/tracker-tasks/client-store";
import { useTrackerTaskLinks } from "@/lib/tracker-tasks/client-state";
import {
  TRACKER_PRIORITY_PRESENTATION,
  formatTrackerDue,
  getInitials,
  resolveTrackerLabelColor,
} from "@/lib/tracker-tasks/presentation";
import type {
  TrackerTaskListItem,
  TrackerStatusCategory,
} from "@/lib/tracker-tasks/types";
import { taskLayoutStyles } from "./tasks-layout.stylex";
import {
  TRACKER_LINK_STATE_PRESENTATION,
  TRACKER_SOURCE_LABELS,
  copyTrackerTaskValue,
  openTrackerTaskInBrowser,
  resolvePrimaryTrackerTaskLink,
} from "./tracker-task-ui";
import {
  labelColorStyles,
  priorityToneStyles,
  trackerVisualStyles,
} from "./tracker-visual.styles";

const VISIBLE_LABEL_COUNT = 2;

/** Placeholder cards per column while the first refresh is still in flight. */
const SKELETON_CARDS_PER_COLUMN = 2;

/**
 * Only a due date the reader can still act on earns space on a card.
 *
 * A date three months out is true and useless, and printing one on every card
 * is how the footer stopped being scannable — so `normal` and `none` are
 * deliberately absent and stay in the peek's meta grid instead.
 */
const BOARD_DUE_TONE_STYLE = {
  overdue: priorityToneStyles.danger,
  today: priorityToneStyles.warning,
  soon: priorityToneStyles.default,
} as const;

export interface TasksBoardProps {
  items: readonly TrackerTaskListItem[];
  /** Passed in so every card in one render agrees about what "today" is. */
  now: Date;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onKickoff: (key: string) => void;
  onAttach: (key: string) => void;
  onOpenStaveTask: (key: string) => void;
  /** Absent when no workspace is active, which disables Attach. */
  attachTargetLabel: string | null;
  /** Draws the column shape with placeholder cards instead of an empty board. */
  loading?: boolean;
}

const BOARD_STATES: Record<TrackerStatusCategory, WorkflowState> = {
  todo: "todo",
  in_progress: "inProgress",
  in_review: "inReview",
  done: "done",
  closed: "canceled",
};

/** Shared read-only board anatomy with host-owned ticket actions. */
export function TasksBoard(props: TasksBoardProps) {
  const columns = groupTrackerTasksForBoard(props.items);
  const loading = props.loading === true;

  return (
    <Board
      readOnly
      data-stave-tasks-board=""
      aria-busy={loading || undefined}
      xstyle={taskLayoutStyles.board}
    >
      {columns.map((column) => (
        <Board.Column
          id={column.id}
          count={column.items.length}
          title={
            <span className={sx(taskLayoutStyles.boardTitle)}>
              <StateIcon state={BOARD_STATES[column.id]} />
              {column.title}
            </span>
          }
          key={column.id}
          data-board-column={column.id}
          aria-label={
            loading
              ? `${column.title}, loading`
              : `${column.title}, ${column.items.length} tickets`
          }
          xstyle={taskLayoutStyles.boardColumn}
        >
          <div className={sx(taskLayoutStyles.boardItems)}>
            {loading ? (
              Array.from({ length: SKELETON_CARDS_PER_COLUMN }).map(
                (_, index) => <TasksBoardSkeletonCard key={index} />,
              )
            ) : column.items.length === 0 ? (
              <p className={sx(taskLayoutStyles.boardColumnEmpty)}>
                No tickets
              </p>
            ) : (
              column.items.map((item) => {
                const key = trackerTaskKey(item.task.source, item.task.ref);
                return (
                  <div role="listitem" key={key}>
                    <TasksBoardCard
                      item={item}
                      now={props.now}
                      selected={props.selectedKey === key}
                      onSelect={props.onSelect}
                      onKickoff={props.onKickoff}
                      onAttach={props.onAttach}
                      onOpenStaveTask={props.onOpenStaveTask}
                      attachTargetLabel={props.attachTargetLabel}
                    />
                  </div>
                );
              })
            )}
          </div>
        </Board.Column>
      ))}
    </Board>
  );
}

function TasksBoardSkeletonCard() {
  return (
    <div aria-hidden="true" className={sx(taskLayoutStyles.boardSkeletonCard)}>
      <Skeleton height={10} width="34%" />
      <Skeleton height={14} width="90%" />
      <Skeleton height={14} width="62%" />
      <div className={sx(taskLayoutStyles.boardSkeletonFooter)}>
        <Skeleton height={18} width={56} />
        <Skeleton height={24} variant="avatar" width={24} />
      </div>
    </div>
  );
}

const TasksBoardCard = memo(function TasksBoardCard(props: {
  item: TrackerTaskListItem;
  now: Date;
  selected: boolean;
  onSelect: (key: string) => void;
  onKickoff: (key: string) => void;
  onAttach: (key: string) => void;
  onOpenStaveTask: (key: string) => void;
  attachTargetLabel: string | null;
}) {
  const { task } = props.item;
  const key = trackerTaskKey(task.source, task.ref);
  // Same contract as the list row: the pushed mirror wins once a kickoff lands,
  // and the item's own links are the fallback for a freshly rendered list.
  const pushedLinks = useTrackerTaskLinks(key);
  const links = pushedLinks.length > 0 ? pushedLinks : props.item.staveLinks;
  const link = resolvePrimaryTrackerTaskLink(links);
  const linkPresentation = link
    ? TRACKER_LINK_STATE_PRESENTATION[link.state]
    : null;
  const priority = TRACKER_PRIORITY_PRESENTATION[task.priority.level];
  const due = formatTrackerDue(task.dueDate, props.now);
  const dueStyle =
    due && due.tone in BOARD_DUE_TONE_STYLE
      ? BOARD_DUE_TONE_STYLE[due.tone as keyof typeof BOARD_DUE_TONE_STYLE]
      : null;
  const finished =
    task.status.category === "done" || task.status.category === "closed";
  const hiddenLabelCount = Math.max(
    0,
    task.labels.length - VISIBLE_LABEL_COUNT,
  );
  const initials = task.assignee ? getInitials(task.assignee.name) : null;
  const visibleLabels = task.labels.slice(0, VISIBLE_LABEL_COUNT);
  const hasFooter =
    visibleLabels.length > 0 ||
    hiddenLabelCount > 0 ||
    linkPresentation !== null ||
    dueStyle !== null ||
    initials !== null;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <AdsButton
            layout="host"
            type="button"
            data-tracker-task-key={key}
            aria-pressed={props.selected}
            onClick={() => props.onSelect(key)}
            onDoubleClick={() => props.onKickoff(key)}
            xstyle={[
              taskLayoutStyles.boardCard,
              focusRing.ring,
              transition.colors,
              props.selected && taskLayoutStyles.boardCardSelected,
            ]}
          />
        }
      >
        <div className={sx(taskLayoutStyles.boardCardTop)}>
          <span className={sx(taskLayoutStyles.boardCardKeyGroup)}>
            <span title={TRACKER_SOURCE_LABELS[task.source]}>
              <ServiceLinkIcon
                kind={task.source === "crane" ? "crane" : "jira"}
                className={sx(trackerVisualStyles.icon)}
              />
            </span>
            <span className={sx(taskLayoutStyles.boardCardKey)}>
              {task.key}
            </span>
            {task.parentKey ? (
              <CornerDownRight
                className={sx(trackerVisualStyles.icon)}
                aria-label={`Subtask of ${task.parentKey}`}
              />
            ) : null}
          </span>
          <span title={priority.label}>
            <PriorityIcon
              priority={task.priority.level}
              aria-label={priority.label}
            />
          </span>
        </div>

        <span
          className={sx(
            taskLayoutStyles.boardCardTitle,
            finished && taskLayoutStyles.boardCardFinished,
          )}
          title={task.title}
        >
          {task.title}
        </span>

        {hasFooter ? (
          <div className={sx(taskLayoutStyles.boardCardFooter)}>
            <span className={sx(taskLayoutStyles.boardLabels)}>
              {visibleLabels.map((label) => {
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
                          color.kind === "token" &&
                            labelColorStyles[color.token],
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
            <span className={sx(taskLayoutStyles.boardCardTrailing)}>
              {linkPresentation ? (
                <Badge
                  variant="outline"
                  tone={linkPresentation.tone}
                  dot={linkPresentation.live}
                >
                  {!linkPresentation.live ? (
                    <GitBranch className={sx(trackerVisualStyles.icon)} />
                  ) : null}
                  {linkPresentation.label}
                </Badge>
              ) : null}
              {due && dueStyle ? (
                <span className={sx(taskLayoutStyles.boardDue, dueStyle)}>
                  {due.label}
                </span>
              ) : null}
              {initials ? (
                <span
                  className={sx(taskLayoutStyles.boardAvatar)}
                  title={task.assignee?.name}
                >
                  {initials}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={() => props.onKickoff(key)}>
          Kick off in Stave
        </ContextMenuItem>
        {link ? (
          <ContextMenuItem onSelect={() => props.onOpenStaveTask(key)}>
            Jump to Stave task
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => openTrackerTaskInBrowser(task.url)}>
          <ExternalLink className={sx(trackerVisualStyles.icon)} />
          Open in browser
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            copyTrackerTaskValue({ value: task.key, label: "ticket key" })
          }
        >
          Copy key
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            copyTrackerTaskValue({ value: task.url, label: "ticket link" })
          }
        >
          <Link2 className={sx(trackerVisualStyles.icon)} />
          Copy link
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={props.attachTargetLabel === null}
          onSelect={() => props.onAttach(key)}
        >
          {props.attachTargetLabel
            ? `Attach to ${props.attachTargetLabel}`
            : "Attach to current workspace"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
