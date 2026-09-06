import { Button as AdsButton } from "@/components/ads/components/Button";
import { memo } from "react";
import { CornerDownRight, ExternalLink, GitBranch, Link2 } from "lucide-react";

import { Badge } from "@/components/ads/components/Badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import { useTrackerTaskLinks } from "@/lib/tracker-tasks/client-state";
import { trackerTaskKey } from "@/lib/tracker-tasks/client-store";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  formatTrackerDue,
  getInitials,
  resolveTrackerLabelColor,
} from "@/lib/tracker-tasks/presentation";
import type { TrackerTaskListItem } from "@/lib/tracker-tasks/types";
import * as stylex from "@stylexjs/stylex";
import {
  taskRowFocus,
  taskRowStyles as styles,
  taskRowTransition,
} from "./tasks-row.styles";
import { labelColorStyles, priorityToneStyles } from "./tracker-visual.styles";
import {
  TRACKER_LINK_STATE_PRESENTATION,
  TRACKER_PRIORITY_ICONS,
  TRACKER_SOURCE_LABELS,
  copyTrackerTaskValue,
  openTrackerTaskInBrowser,
  resolvePrimaryTrackerTaskLink,
} from "./tracker-task-ui";

/** Label chips shown inline before the row collapses the rest into "+N". */
const VISIBLE_LABEL_COUNT = 2;

const DUE_TONE_STYLE = {
  overdue: styles.danger,
  today: styles.warning,
  soon: styles.foreground,
  normal: styles.muted,
  none: styles.muted,
};

export interface TrackerTaskRowProps {
  item: TrackerTaskListItem;
  /** Passed in so every row in one render agrees about what "today" is. */
  now: Date;
  selected: boolean;
  onSelect: (key: string) => void;
  onKickoff: (key: string) => void;
  onAttach: (key: string) => void;
  onOpenStaveTask: (key: string) => void;
  /** Absent when no workspace is active, which disables Attach. */
  attachTargetLabel: string | null;
}

/**
 * One tracker ticket.
 *
 * Memoized and subscribed to its own link slice: a kickoff push for one ticket
 * must not re-render the rest of a several-hundred-row list.
 */
export const TrackerTaskRow = memo(function TrackerTaskRow(
  props: TrackerTaskRowProps,
) {
  const { item, now } = props;
  const { task } = item;
  const key = trackerTaskKey(task.source, task.ref);
  // The mirror is the live source once a kickoff push lands, but a row rendered
  // straight from a list reply (or in a test) has its links only on the item, so
  // the prop is the fallback rather than being ignored.
  const pushedLinks = useTrackerTaskLinks(key);
  const links = pushedLinks.length > 0 ? pushedLinks : item.staveLinks;
  const link = resolvePrimaryTrackerTaskLink(links);
  const linkPresentation = link
    ? TRACKER_LINK_STATE_PRESENTATION[link.state]
    : null;
  const status = TRACKER_STATUS_PRESENTATION[task.status.category];
  const priority = TRACKER_PRIORITY_PRESENTATION[task.priority.level];
  const PriorityIcon = TRACKER_PRIORITY_ICONS[priority.iconName];
  const due = formatTrackerDue(task.dueDate, now);
  const finished =
    task.status.category === "done" || task.status.category === "closed";
  const jiraLink = task.links.find(
    (candidate) => candidate.rel.trim().toLowerCase() === "jira",
  );
  const hiddenLabelCount = Math.max(
    0,
    task.labels.length - VISIBLE_LABEL_COUNT,
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            role="option"
            aria-selected={props.selected}
            data-tracker-task-key={key}
            tabIndex={-1}
            onClick={() => props.onSelect(key)}
            onDoubleClick={() => props.onKickoff(key)}
            {...stylex.props(
              styles.row,
              taskRowTransition,
              taskRowFocus,
              props.selected && styles.selected,
            )}
          />
        }
      >
        <span
          {...stylex.props(styles.sourceIcon)}
          title={TRACKER_SOURCE_LABELS[task.source]}
        >
          <ServiceLinkIcon
            kind={task.source === "crane" ? "crane" : "jira"}
            className={stylex.props(styles.icon15).className}
          />
        </span>

        <span {...stylex.props(styles.key, priorityToneStyles[priority.tone])}>
          {task.key}
        </span>

        <span
          {...stylex.props(styles.priority, priorityToneStyles[priority.tone])}
          title={priority.label}
        >
          <PriorityIcon
            {...stylex.props(styles.priority)}
            aria-label={priority.label}
          />
        </span>

        <span
          {...stylex.props(styles.title, finished && styles.finished)}
          title={task.title}
        >
          {task.parentKey ? (
            <CornerDownRight
              className={stylex.props(styles.inlineParent).className}
              aria-label={`Subtask of ${task.parentKey}`}
            />
          ) : null}
          {task.title}
        </span>

        {task.labels.slice(0, VISIBLE_LABEL_COUNT).map((label) => {
          const color = resolveTrackerLabelColor(label.color);
          return (
            <span key={label.name} {...stylex.props(styles.label)}>
              {color === null ? null : (
                <span
                  aria-hidden="true"
                  className={
                    stylex.props(
                      styles.labelDot,
                      color.kind === "token"
                        ? labelColorStyles[color.token]
                        : null,
                    ).className
                  }
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
          <span {...stylex.props(styles.hiddenCount)}>+{hiddenLabelCount}</span>
        ) : null}

        {jiraLink ? (
          <span
            {...stylex.props(styles.external)}
            title={`Mirrors ${jiraLink.key ?? "a Jira issue"}`}
          >
            <ServiceLinkIcon
              kind="jira"
              className={stylex.props(styles.icon15).className}
            />
            {jiraLink.key ?? "Jira"}
          </span>
        ) : null}

        {linkPresentation ? (
          <AdsButton
            layout="host"
            type="button"
            variant="quiet"
            xstyle={styles.link}
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenStaveTask(key);
            }}
          >
            <Badge
              variant="outline"
              tone={linkPresentation.tone}
              dot={linkPresentation.live}
            >
              {!linkPresentation.live ? (
                <GitBranch {...stylex.props(styles.linkIcon)} />
              ) : null}
              {linkPresentation.label}
            </Badge>
          </AdsButton>
        ) : null}

        <Badge
          variant="outline"
          tone={status.tone}
          {...stylex.props(styles.status)}
        >
          {status.label}
        </Badge>

        {task.effort !== null ? (
          <span {...stylex.props(styles.effort)}>{task.effort}</span>
        ) : null}

        <span
          {...stylex.props(
            styles.due,
            due ? DUE_TONE_STYLE[due.tone] : styles.transparent,
          )}
        >
          {due?.label ?? "—"}
        </span>

        <span
          {...stylex.props(styles.assignee)}
          title={task.assignee?.name ?? "Unassigned"}
        >
          {task.assignee ? getInitials(task.assignee.name) : "—"}
        </span>
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
          <ExternalLink {...stylex.props(styles.icon15)} />
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
          <Link2 {...stylex.props(styles.icon15)} />
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
