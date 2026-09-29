import { Button as AdsButton } from "@/components/ads/components/Button";
import { assignTrackerIssueToAgent } from "./assign-issue-to-agent";
import { Badge } from "@/components/ads/components/Badge";
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
  useTrackerIssueDetail,
  useTrackerIssueDetailPending,
  useTrackerIssueLinks,
} from "@/lib/tracker-issues/client-state";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import type { TrackerIssueListItem } from "@/lib/tracker-issues/types";
import { sx } from "@/components/ads/utils/stylex";
import { TrackerIssueMeta } from "./TrackerIssueMeta";
import { taskLayoutStyles } from "./issues-layout.stylex";
import {
  TRACKER_LINK_STATE_PRESENTATION,
  copyTrackerIssueValue,
  openTrackerIssueInBrowser,
  resolvePrimaryTrackerIssueLink,
} from "./tracker-issue-ui";

export interface TrackerIssueDetailPaneProps {
  item: TrackerIssueListItem;
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

export function TrackerIssueDetailPane(props: TrackerIssueDetailPaneProps) {
  const { task } = props.item;
  const key = trackerIssueKey(task.source, task.ref);
  const detail = useTrackerIssueDetail(key);
  const detailPending = useTrackerIssueDetailPending(key);
  const links = useTrackerIssueLinks(key);
  const link = resolvePrimaryTrackerIssueLink(links);
  const linkPresentation = link
    ? TRACKER_LINK_STATE_PRESENTATION[link.state]
    : null;
  const jiraLink = task.links.find(
    (candidate) => candidate.rel.trim().toLowerCase() === "jira",
  );
  const jiraBadge = jiraLink ? resolveServiceLinkBadge(jiraLink.url) : null;

  return (
    <div
      className={sx(
        taskLayoutStyles.detailRoot,
        !props.embedded && taskLayoutStyles.detailStandalone,
      )}
    >
      <header className={sx(taskLayoutStyles.detailHeader)}>
        <div className={sx(taskLayoutStyles.detailKey)}>
          <span className={sx(taskLayoutStyles.detailKeyText)}>{task.key}</span>
          {jiraBadge && jiraLink ? (
            <ServiceLinkBadge
              href={jiraLink.url}
              badge={jiraBadge}
              label={jiraLink.key ?? undefined}
            />
          ) : null}
        </div>
        <h2 className={sx(taskLayoutStyles.detailTitle)}>{task.title}</h2>
        <div className={sx(taskLayoutStyles.detailActions)}>
          <Button
            type="button"
            size="sm"
            xstyle={taskLayoutStyles.detailAction}
            onClick={() =>
              link ? props.onOpenStaveTask(key) : props.onKickoff(key)
            }
          >
            {link ? (
              <>
                <ChevronRight className={sx(taskLayoutStyles.icon14)} />
                Open in Stave
              </>
            ) : (
              <>
                <Play className={sx(taskLayoutStyles.icon14)} />
                Kick off
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            xstyle={taskLayoutStyles.detailAction}
            onClick={() => openTrackerIssueInBrowser(task.url)}
          >
            <ExternalLink className={sx(taskLayoutStyles.icon14)} />
            Open in browser
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={taskLayoutStyles.detailMenuAction}
                  aria-label="More ticket actions"
                />
              }
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => assignTrackerIssueToAgent(task)}>
                Assign to agent
              </DropdownMenuItem>
              {link ? (
                <DropdownMenuItem onSelect={() => props.onKickoff(key)}>
                  Kick off again
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  copyTrackerIssueValue({ value: task.key, label: "ticket key" })
                }
              >
                Copy key
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  copyTrackerIssueValue({
                    value: task.url,
                    label: "ticket link",
                  })
                }
              >
                <Link2 className={sx(taskLayoutStyles.icon14)} />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={props.attachTargetLabel === null}
                onSelect={() => props.onAttach(key)}
              >
                <Paperclip className={sx(taskLayoutStyles.icon14)} />
                {props.attachTargetLabel
                  ? `Attach to ${props.attachTargetLabel}`
                  : "Attach to current workspace"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className={sx(taskLayoutStyles.detailBody)}>
        {linkPresentation && link ? (
          <AdsButton
            layout="host"
            type="button"
            onClick={() => props.onOpenStaveTask(key)}
            xstyle={taskLayoutStyles.detailLink}
          >
            {linkPresentation.live ? (
              <ThinkingOrb
                state="working"
                size={20}
                theme="auto"
                aria-label="Stave run in progress"
              />
            ) : null}
            <span className={sx(taskLayoutStyles.detailLinkCopy)}>
              <span className={sx(taskLayoutStyles.detailLinkTitle)}>
                {linkPresentation.label} in Stave
              </span>
              <span className={sx(taskLayoutStyles.detailLinkSubtitle)}>
                {link.errorCode
                  ? `Workspace ${link.workspaceId} — ${link.errorCode}`
                  : `Workspace ${link.workspaceId}`}
              </span>
            </span>
            <Badge variant="outline" tone={linkPresentation.tone}>
              {link.craneJobId ? "Reported to Crane" : "Local only"}
            </Badge>
          </AdsButton>
        ) : null}

        <TrackerIssueMeta task={task} now={props.now} />

        <section className={sx(taskLayoutStyles.detailSection)}>
          <h3 className={sx(taskLayoutStyles.detailSectionTitle)}>
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
              <p className={sx(taskLayoutStyles.detailMuted)}>
                This ticket has no description.
              </p>
            )
          ) : detailPending ? (
            <div className={sx(taskLayoutStyles.detailSkeletons)}>
              <Skeleton className={sx(taskLayoutStyles.detailSkeletonFull)} />
              <Skeleton className={sx(taskLayoutStyles.detailSkeletonEleven)} />
              <Skeleton className={sx(taskLayoutStyles.detailSkeletonEight)} />
            </div>
          ) : (
            <p className={sx(taskLayoutStyles.detailMuted)}>
              The description could not be loaded.
            </p>
          )}
        </section>

        {detail?.comments && detail.comments.length > 0 ? (
          <Accordion className={sx(taskLayoutStyles.detailComments)}>
            <AccordionItem value="comments">
              <AccordionTrigger
                className={sx(taskLayoutStyles.detailAccordionTrigger)}
              >
                Comments ({detail.comments.length})
              </AccordionTrigger>
              <AccordionContent
                className={sx(taskLayoutStyles.detailAccordionContent)}
              >
                {detail.comments.map((comment, index) => (
                  <div
                    key={`${comment.author}-${comment.createdAt}-${index}`}
                    className={sx(taskLayoutStyles.detailComment)}
                  >
                    <p className={sx(taskLayoutStyles.detailCommentMeta)}>
                      {comment.author} ·{" "}
                      {new Date(comment.createdAt).toLocaleString()}
                    </p>
                    <p className={sx(taskLayoutStyles.detailCommentBody)}>
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
