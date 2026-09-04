import {
  ChevronRight,
  ExternalLink,
  Link2,
  Paperclip,
  Play,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import { MarkdownMessage } from "@/components/ai-elements/message-markdown";
import { ServiceLinkBadge } from "@/components/ui/service-link-badge";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import {
  useTrackerTaskDetail,
  useTrackerTaskDetailPending,
  useTrackerTaskLinks,
} from "@/lib/tracker-tasks/client-state";
import { trackerTaskKey } from "@/lib/tracker-tasks/client-store";
import type { TrackerTaskListItem } from "@/lib/tracker-tasks/types";
import { cn } from "@/lib/utils";
import { TrackerTaskMeta } from "./TrackerTaskMeta";
import {
  TRACKER_LINK_STATE_PRESENTATION,
  copyTrackerTaskValue,
  openTrackerTaskInBrowser,
  resolvePrimaryTrackerTaskLink,
} from "./tracker-task-ui";

export interface TrackerTaskDetailPaneProps {
  item: TrackerTaskListItem;
  now: Date;
  onKickoff: (key: string) => void;
  onAttach: (key: string) => void;
  onOpenStaveTask: (key: string) => void;
  attachTargetLabel: string | null;
  /** Description rendering reuses the chat markdown scale. */
  messageFontSize: number;
  messageCodeFontSize: number;
  /** Drop the pane's own leading edge when a peek already draws it. */
  embedded?: boolean;
}

export function TrackerTaskDetailPane(props: TrackerTaskDetailPaneProps) {
  const { task } = props.item;
  const key = trackerTaskKey(task.source, task.ref);
  const detail = useTrackerTaskDetail(key);
  const detailPending = useTrackerTaskDetailPending(key);
  const links = useTrackerTaskLinks(key);
  const link = resolvePrimaryTrackerTaskLink(links);
  const linkPresentation = link
    ? TRACKER_LINK_STATE_PRESENTATION[link.state]
    : null;
  const jiraLink = task.links.find(
    (candidate) => candidate.rel.trim().toLowerCase() === "jira",
  );
  const jiraBadge = jiraLink ? resolveServiceLinkBadge(jiraLink.url) : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        props.embedded ? "" : "border-l border-border/60 bg-surface/40",
      )}
    >
      <header className="shrink-0 space-y-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{task.key}</span>
          {jiraBadge && jiraLink ? (
            <ServiceLinkBadge
              href={jiraLink.url}
              badge={jiraBadge}
              label={jiraLink.key ?? undefined}
            />
          ) : null}
        </div>
        <h2 className="font-heading text-base font-semibold leading-6 text-foreground">
          {task.title}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() =>
              link ? props.onOpenStaveTask(key) : props.onKickoff(key)
            }
          >
            {link ? (
              <>
                <ChevronRight className="size-3.5" />
                Open in Stave
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                Kick off
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => openTrackerTaskInBrowser(task.url)}
          >
            <ExternalLink className="size-3.5" />
            Open in browser
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs"
                  aria-label="More ticket actions"
                />
              }
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {link ? (
                <DropdownMenuItem onSelect={() => props.onKickoff(key)}>
                  Kick off again
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  copyTrackerTaskValue({ value: task.key, label: "ticket key" })
                }
              >
                Copy key
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  copyTrackerTaskValue({
                    value: task.url,
                    label: "ticket link",
                  })
                }
              >
                <Link2 className="size-3.5" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={props.attachTargetLabel === null}
                onSelect={() => props.onAttach(key)}
              >
                <Paperclip className="size-3.5" />
                {props.attachTargetLabel
                  ? `Attach to ${props.attachTargetLabel}`
                  : "Attach to current workspace"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {linkPresentation && link ? (
          <button
            type="button"
            onClick={() => props.onOpenStaveTask(key)}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-left transition-colors hover:bg-muted/50"
          >
            {linkPresentation.live ? (
              <ThinkingOrb
                state="working"
                size={20}
                theme="auto"
                aria-label="Stave run in progress"
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">
                {linkPresentation.label} in Stave
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {link.errorCode
                  ? `Workspace ${link.workspaceId} — ${link.errorCode}`
                  : `Workspace ${link.workspaceId}`}
              </span>
            </span>
            <Badge
              variant="outline"
              className={cn("text-xs", linkPresentation.toneClassName)}
            >
              {link.craneJobId ? "Reported to Crane" : "Local only"}
            </Badge>
          </button>
        ) : null}

        <TrackerTaskMeta task={task} now={props.now} />

        <section className="space-y-1.5">
          <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Description
          </h3>
          {detail ? (
            detail.description.trim() ? (
              <MarkdownMessage
                content={detail.description}
                messageFontSize={props.messageFontSize}
                messageCodeFontSize={props.messageCodeFontSize}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                This ticket has no description.
              </p>
            )
          ) : detailPending ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-8/12" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The description could not be loaded.
            </p>
          )}
        </section>

        {detail?.comments && detail.comments.length > 0 ? (
          <Accordion className="border-t border-border/60">
            <AccordionItem value="comments" className="border-b-0">
              <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                Comments ({detail.comments.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-2">
                {detail.comments.map((comment, index) => (
                  <div
                    key={`${comment.author}-${comment.createdAt}-${index}`}
                    className="space-y-0.5"
                  >
                    <p className="text-xs text-muted-foreground">
                      {comment.author} ·{" "}
                      {new Date(comment.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap text-xs leading-5 text-foreground">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </div>
    </div>
  );
}
