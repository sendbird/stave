import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
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
  const { t: tI18n } = useTranslation(["issues"]);
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
                {tI18n("issues:trackerIssueDetailPane.openInStave")}</>
            ) : (
              <>
                <Play className={sx(taskLayoutStyles.icon14)} />
                {tI18n("issues:trackerIssueDetailPane.kickOff")}</>
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
            {tI18n("issues:trackerIssueDetailPane.openInBrowser")}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={taskLayoutStyles.detailMenuAction}
                  aria-label={tI18n("issues:trackerIssueDetailPane.moreTicketActions")}
                />
              }
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => assignTrackerIssueToAgent(task)}>
                {tI18n("issues:trackerIssueDetailPane.assignToAgent")}</DropdownMenuItem>
              {link ? (
                <DropdownMenuItem onSelect={() => props.onKickoff(key)}>
                  {tI18n("issues:trackerIssueDetailPane.kickOffAgain")}</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  copyTrackerIssueValue({ value: task.key, label: tI18n("issues:trackerIssueDetailPane.ticketKey") })
                }
              >
                {tI18n("issues:trackerIssueDetailPane.copyKey")}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  copyTrackerIssueValue({
                    value: task.url,
                    label: tI18n("issues:trackerIssueDetailPane.ticketLink"),
                  })
                }
              >
                <Link2 className={sx(taskLayoutStyles.icon14)} />
                {tI18n("issues:trackerIssueDetailPane.copyLink")}</DropdownMenuItem>
              <DropdownMenuItem
                disabled={props.attachTargetLabel === null}
                onSelect={() => props.onAttach(key)}
              >
                <Paperclip className={sx(taskLayoutStyles.icon14)} />
                {props.attachTargetLabel
                  ? tI18n("issues:trackerIssueDetailPane.attachToValue", { value1: props.attachTargetLabel })
                  : tI18n("issues:trackerIssueDetailPane.attachToCurrentWorkspace")}
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
                aria-label={tI18n("issues:trackerIssueDetailPane.staveRunInProgress")}
              />
            ) : null}
            <span className={sx(taskLayoutStyles.detailLinkCopy)}>
              <span className={sx(taskLayoutStyles.detailLinkTitle)}>
          {tI18n("issues:trackerIssueDetailPane.staveState", { state: linkPresentation.label })}
        </span>
              <span className={sx(taskLayoutStyles.detailLinkSubtitle)}>
                {link.errorCode
                  ? tI18n("issues:trackerIssueDetailPane.workspaceValueValue", { value1: link.workspaceId, value2: link.errorCode })
                  : tI18n("issues:trackerIssueDetailPane.workspaceValue", { value1: link.workspaceId })}
              </span>
            </span>
            <Badge variant="outline" tone={linkPresentation.tone}>
              {link.craneJobId ? tI18n("issues:trackerIssueDetailPane.reportedToCrane") : tI18n("issues:trackerIssueDetailPane.localOnly")}
            </Badge>
          </AdsButton>
        ) : null}

        <TrackerIssueMeta task={task} now={props.now} />

        <section className={sx(taskLayoutStyles.detailSection)}>
          <h3 className={sx(taskLayoutStyles.detailSectionTitle)}>
            {tI18n("issues:trackerIssueDetailPane.description")}</h3>
          {detail ? (
            detail.description.trim() ? (
              <MarkdownMessage
                content={detail.description}
                messageFontSize={props.messageFontSize}
                messageCodeFontSize={props.messageCodeFontSize}
              />
            ) : (
              <p className={sx(taskLayoutStyles.detailMuted)}>
                {tI18n("issues:trackerIssueDetailPane.thisTicketHasNoDescription")}</p>
            )
          ) : detailPending ? (
            <div className={sx(taskLayoutStyles.detailSkeletons)}>
              <Skeleton className={sx(taskLayoutStyles.detailSkeletonFull)} />
              <Skeleton className={sx(taskLayoutStyles.detailSkeletonEleven)} />
              <Skeleton className={sx(taskLayoutStyles.detailSkeletonEight)} />
            </div>
          ) : (
            <p className={sx(taskLayoutStyles.detailMuted)}>
              {tI18n("issues:trackerIssueDetailPane.theDescriptionCouldNotBeLoaded")}</p>
          )}
        </section>

        {detail?.comments && detail.comments.length > 0 ? (
          <Accordion className={sx(taskLayoutStyles.detailComments)}>
            <AccordionItem value="comments">
              <AccordionTrigger
                className={sx(taskLayoutStyles.detailAccordionTrigger)}
              >
          {tI18n("issues:trackerIssueDetailPane.commentCount", { count: detail.comments.length })}
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
                      {formatDateTime(new Date(comment.createdAt))}
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
