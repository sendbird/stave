import { memo } from "react";
import { CornerDownRight, ExternalLink, GitBranch, Link2 } from "lucide-react";

import { Badge } from "@/components/ui";
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
import { cn } from "@/lib/utils";
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

const DUE_TONE_CLASS: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-warning",
  soon: "text-foreground",
  normal: "text-muted-foreground",
  none: "text-muted-foreground",
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
  const hiddenLabelCount = Math.max(0, task.labels.length - VISIBLE_LABEL_COUNT);

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
            className={cn(
              "flex cursor-default items-center gap-2.5 border-b border-border/40 px-4 py-2 text-[12px] transition-colors",
              props.selected
                ? "bg-accent/45"
                : "hover:bg-accent/25 focus-visible:bg-accent/25",
            )}
          />
        }
      >
        <span
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
          title={TRACKER_SOURCE_LABELS[task.source]}
        >
          <ServiceLinkIcon
            kind={task.source === "crane" ? "crane" : "jira"}
            className="text-[13px]"
          />
        </span>

        <span
          className={cn(
            "shrink-0 font-mono text-[11px]",
            priority.toneClassName === "text-destructive"
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          {task.key}
        </span>

        <span
          className={cn("shrink-0", priority.toneClassName)}
          title={priority.label}
        >
          <PriorityIcon className="size-3.5" aria-label={priority.label} />
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            finished && "text-muted-foreground line-through",
          )}
          title={task.title}
        >
          {task.parentKey ? (
            <CornerDownRight
              className="mr-1 inline size-3 text-muted-foreground/70"
              aria-label={`Subtask of ${task.parentKey}`}
            />
          ) : null}
          {task.title}
        </span>

        {task.labels.slice(0, VISIBLE_LABEL_COUNT).map((label) => {
          const color = resolveTrackerLabelColor(label.color);
          return (
            <span
              key={label.name}
              className="hidden shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground lg:inline-flex"
            >
              {color === null ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
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
          <span className="hidden shrink-0 text-[10px] text-muted-foreground lg:inline">
            +{hiddenLabelCount}
          </span>
        ) : null}

        {jiraLink ? (
          <span
            className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground md:inline-flex"
            title={`Mirrors ${jiraLink.key ?? "a Jira issue"}`}
          >
            <ServiceLinkIcon kind="jira" className="text-[11px]" />
            {jiraLink.key ?? "Jira"}
          </span>
        ) : null}

        {linkPresentation ? (
          <button
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px]",
              linkPresentation.toneClassName,
            )}
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenStaveTask(key);
            }}
          >
            {linkPresentation.live ? (
              // A dot rather than the animated orb: the smallest tuned orb is
              // 20px and would set the height of a row built around 12px text.
              <span
                aria-hidden="true"
                className="size-1.5 animate-pulse rounded-full bg-current"
              />
            ) : (
              <GitBranch className="size-2.5" />
            )}
            {linkPresentation.label}
          </button>
        ) : null}

        <Badge
          variant="outline"
          className={cn("shrink-0 text-[10px]", status.toneClassName)}
        >
          {status.label}
        </Badge>

        {task.effort !== null ? (
          <span className="hidden w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:inline">
            {task.effort}
          </span>
        ) : null}

        <span
          className={cn(
            "w-16 shrink-0 text-right text-[11px]",
            due ? DUE_TONE_CLASS[due.tone] : "text-transparent",
          )}
        >
          {due?.label ?? "—"}
        </span>

        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground"
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
          <ExternalLink className="size-3.5" />
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
          <Link2 className="size-3.5" />
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
