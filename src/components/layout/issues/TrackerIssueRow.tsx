import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { assignTrackerIssueToAgent } from "./assign-issue-to-agent";
import { memo } from "react";
import { CornerDownRight, ExternalLink, GitBranch, Link2 } from "lucide-react";

import { Badge } from "@/components/ads/components/Badge";
import { PriorityIcon } from "@/components/ads/components/WorkflowIcon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import { useTrackerIssueLinks } from "@/lib/tracker-issues/client-state";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import {
  TRACKER_PRIORITY_PRESENTATION,
  TRACKER_STATUS_PRESENTATION,
  formatTrackerDue,
  getInitials,
  resolveTrackerLabelColor,
} from "@/lib/tracker-issues/presentation";
import type { TrackerIssueListItem } from "@/lib/tracker-issues/types";
import * as stylex from "@stylexjs/stylex";
import {
  taskRowFocus,
  taskRowStyles as styles,
  taskRowTransition,
} from "./issues-row.styles";
import { labelColorStyles, priorityToneStyles } from "./tracker-visual.styles";
import {
  TRACKER_LINK_STATE_PRESENTATION,
  TRACKER_SOURCE_LABELS,
  copyTrackerIssueValue,
  openTrackerIssueInBrowser,
  resolvePrimaryTrackerIssueLink,
} from "./tracker-issue-ui";

/** Label chips shown inline before the row collapses the rest into "+N". */
const VISIBLE_LABEL_COUNT = 2;

const DUE_TONE_STYLE = {
  overdue: styles.danger,
  today: styles.warning,
  soon: styles.foreground,
  normal: styles.muted,
  none: styles.muted,
};

export interface TrackerIssueRowProps {
  item: TrackerIssueListItem;
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
export const TrackerIssueRow = memo(function TrackerIssueRow(
  props: TrackerIssueRowProps,
) {
  const { t: tI18n } = useTranslation(["issues"]);
  const { item, now } = props;
  const { task } = item;
  const key = trackerIssueKey(task.source, task.ref);
  // The mirror is the live source once a kickoff push lands, but a row rendered
  // straight from a list reply (or in a test) has its links only on the item, so
  // the prop is the fallback rather than being ignored.
  const pushedLinks = useTrackerIssueLinks(key);
  const links = pushedLinks.length > 0 ? pushedLinks : item.staveLinks;
  const link = resolvePrimaryTrackerIssueLink(links);
  const linkPresentation = link
    ? TRACKER_LINK_STATE_PRESENTATION[link.state]
    : null;
  const status = TRACKER_STATUS_PRESENTATION[task.status.category];
  const priority = TRACKER_PRIORITY_PRESENTATION[task.priority.level];
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
            data-tracker-issue-key={key}
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
            priority={task.priority.level}
          />
        </span>

        <span
          {...stylex.props(styles.title, finished && styles.finished)}
          title={task.title}
        >
          {task.parentKey ? (
            <CornerDownRight
              className={stylex.props(styles.inlineParent).className}
              aria-label={tI18n("issues:trackerIssueRow.subtaskOfValue", { value1: task.parentKey })}
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
            title={tI18n("issues:trackerIssueRow.mirrorsValue", { value1: jiraLink.key ?? "a Jira issue" })}
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
          title={task.assignee?.name ?? tI18n("issues:trackerIssueRow.unassigned")}
        >
          {task.assignee ? getInitials(task.assignee.name) : "—"}
        </span>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={() => props.onKickoff(key)}>
          {tI18n("issues:trackerIssueRow.kickOffInStave")}</ContextMenuItem>
        <ContextMenuItem onSelect={() => assignTrackerIssueToAgent(task)}>
          {tI18n("issues:trackerIssueRow.assignToAgent")}</ContextMenuItem>
        {link ? (
          <ContextMenuItem onSelect={() => props.onOpenStaveTask(key)}>
            {tI18n("issues:trackerIssueRow.jumpToStaveTask")}</ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => openTrackerIssueInBrowser(task.url)}>
          <ExternalLink {...stylex.props(styles.icon15)} />
          {tI18n("issues:trackerIssueRow.openInBrowser")}</ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            copyTrackerIssueValue({ value: task.key, label: tI18n("issues:trackerIssueRow.ticketKey") })
          }
        >
          {tI18n("issues:trackerIssueRow.copyKey")}</ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            copyTrackerIssueValue({ value: task.url, label: tI18n("issues:trackerIssueRow.ticketLink") })
          }
        >
          <Link2 {...stylex.props(styles.icon15)} />
          {tI18n("issues:trackerIssueRow.copyLink")}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={props.attachTargetLabel === null}
          onSelect={() => props.onAttach(key)}
        >
          {props.attachTargetLabel
            ? tI18n("issues:trackerIssueRow.attachToValue", { value1: props.attachTargetLabel })
            : tI18n("issues:trackerIssueRow.attachToCurrentWorkspace")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
