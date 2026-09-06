import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Loader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@/components/ui";
import type {
  GitHubPrCheck,
  GitHubPrFile,
  GitHubPrInboxItem,
  GitHubPrInboxKind,
  GitHubPrReviewDetail,
  GitHubPrReviewEvent,
} from "@/lib/github-pr-review";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { SourceControlReviewDialog } from "./SourceControlReviewDialog";
import { reviewsStyles } from "./source-control-reviews-panel.styles";

type ReviewDetailTab = "files" | "conversation" | "checks";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "Unknown activity";
  }
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1_000);
  if (Math.abs(deltaSeconds) < 60) {
    return "Just now";
  }
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return relativeTimeFormatter.format(deltaMinutes, "minute");
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return relativeTimeFormatter.format(deltaHours, "hour");
  }
  const deltaDays = Math.round(deltaHours / 24);
  if (Math.abs(deltaDays) < 30) {
    return relativeTimeFormatter.format(deltaDays, "day");
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year:
      new Date(timestamp).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(timestamp);
}

function reviewDecisionLabel(value: string) {
  switch (value) {
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "REVIEW_REQUIRED":
      return "Review required";
    default:
      return value ? value.toLowerCase().replaceAll("_", " ") : "No decision";
  }
}

function checkTone(check: GitHubPrCheck) {
  const conclusion = check.conclusion.toUpperCase();
  const status = check.status.toUpperCase();
  if (
    ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(
      conclusion,
    )
  ) {
    return "fail" as const;
  }
  if (conclusion === "SUCCESS" || status === "SUCCESS") {
    return "success" as const;
  }
  return "pending" as const;
}

function InboxRow(props: {
  item: GitHubPrInboxItem;
  kind: GitHubPrInboxKind;
  onSelect: () => void;
}) {
  return (
    <li>
      <AdsButton layout="host"
        type="button"
        xstyle={[reviewsStyles.inboxRow, transition.colors]}
        onClick={props.onSelect}
      >
        <span className={sx(reviewsStyles.inboxRowMark)}>
          <GitPullRequest className={sx(reviewsStyles.iconSm)} />
        </span>
        <span className={sx(reviewsStyles.inboxRowBody)}>
          <span className={sx(reviewsStyles.inboxRowRepo)}>
            <span className={sx(reviewsStyles.truncate)}>
              {props.item.repositoryWithOwner}
            </span>
            <span className={sx(reviewsStyles.shrink0)}>
              #{props.item.number}
            </span>
            {props.item.isDraft ? (
              <Badge variant="outline" className={sx(reviewsStyles.shrink0)}>
                Draft
              </Badge>
            ) : null}
          </span>
          <span className={sx(reviewsStyles.inboxRowTitle)}>
            {props.item.title || "Untitled pull request"}
          </span>
          <span className={sx(reviewsStyles.inboxRowMeta)}>
            <span>
              {props.kind === "review-requested"
                ? `Review requested by @${props.item.authorLogin || "unknown"}`
                : `${props.item.commentsCount} comments`}
            </span>
            <span>{formatRelativeTime(props.item.updatedAt)}</span>
          </span>
        </span>
      </AdsButton>
    </li>
  );
}

function InboxState(props: {
  isLoading: boolean;
  error: string;
  items: GitHubPrInboxItem[];
  kind: GitHubPrInboxKind;
  onSelect: (item: GitHubPrInboxItem) => void;
}) {
  if (props.isLoading) {
    return (
      <div
        className={sx(reviewsStyles.centeredStatus)}
        role="status"
      >
        <Loader aria-hidden size="xs" variant="verify" />
        Loading pull requests…
      </div>
    );
  }
  if (props.error) {
    return (
      <div
        className={sx(reviewsStyles.errorBox)}
        role="alert"
      >
        <div className={sx(reviewsStyles.errorRow)}>
          <TriangleAlert className={sx(reviewsStyles.errorIcon)} />
          <div className={sx(reviewsStyles.detailHeaderText)}>
            <p className={sx(reviewsStyles.errorTitle)}>
              Reviews unavailable
            </p>
            <p className={sx(reviewsStyles.errorDetail)}>
              {props.error}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (props.items.length === 0) {
    return (
      <div className={sx(reviewsStyles.emptyState)}>
        <span className={sx(reviewsStyles.emptyMark)}>
          <ShieldCheck className={sx(reviewsStyles.emptyMarkIcon)} />
        </span>
        <p className={sx(reviewsStyles.emptyTitle)}>
          {props.kind === "review-requested"
            ? "No reviews waiting"
            : "No open pull requests"}
        </p>
        <p className={sx(reviewsStyles.emptyBody)}>
          {props.kind === "review-requested"
            ? "Pull requests requesting your review will appear here."
            : "Open pull requests authored by you will appear here."}
        </p>
      </div>
    );
  }
  return (
    <ul className={sx(reviewsStyles.inboxList)}>
      {props.items.map((item) => (
        <InboxRow
          key={item.url}
          item={item}
          kind={props.kind}
          onSelect={() => props.onSelect(item)}
        />
      ))}
    </ul>
  );
}

function FilesView(props: {
  detail: GitHubPrReviewDetail;
  onOpenDiff: (file: GitHubPrFile) => Promise<void>;
}) {
  return (
    <div className={sx(reviewsStyles.filesPane)}>
      {props.detail.filesError ? (
        <p className={sx(reviewsStyles.filesWarning)}>
          {props.detail.filesError}
        </p>
      ) : null}
      {props.detail.files.map((file) => (
        <AdsButton layout="host"
          key={file.path}
          type="button"
          xstyle={[reviewsStyles.fileRow, transition.colors]}
          disabled={!file.patch}
          onClick={() => void props.onOpenDiff(file)}
          title={
            file.patch
              ? `Open ${file.path}`
              : "GitHub did not return a patch for this file"
          }
        >
          <FileCode2 className={sx(reviewsStyles.fileIcon)} />
          <span className={sx(reviewsStyles.fileName)}>
            {file.path}
          </span>
          <span className={sx(reviewsStyles.fileDiffStat)}>
            <span className={sx(reviewsStyles.additions)}>+{file.additions}</span>{" "}
            <span className={sx(reviewsStyles.deletions)}>-{file.deletions}</span>
          </span>
        </AdsButton>
      ))}
      {props.detail.filesTruncated ? (
        <p className={sx(reviewsStyles.filesFootnote)}>
          Showing the first {props.detail.files.length} of{" "}
          {props.detail.changedFiles} files.
        </p>
      ) : null}
    </div>
  );
}

function ConversationView(props: { detail: GitHubPrReviewDetail }) {
  return (
    <div className={sx(reviewsStyles.conversationPane)}>
      <section className={sx(reviewsStyles.conversationSection)}>
        <p className={sx(reviewsStyles.sectionLabel)}>Description</p>
        <p className={sx(reviewsStyles.bodyText)}>
          {props.detail.body || "No description provided."}
        </p>
      </section>
      <section className={sx(reviewsStyles.conversationSection)}>
        <p className={sx(reviewsStyles.sectionLabel)}>Activity</p>
        {props.detail.timeline.length === 0 ? (
          <p className={sx(reviewsStyles.mutedText)}>
            No submitted reviews or comments yet.
          </p>
        ) : (
          <ul className={sx(reviewsStyles.timeline)}>
            {props.detail.timeline.map((item) => (
              <li key={item.id} className={sx(reviewsStyles.timelineItem)}>
                <div className={sx(reviewsStyles.timelineMeta)}>
                  <span className={sx(reviewsStyles.timelineAuthor)}>
                    @{item.authorLogin || "unknown"}
                  </span>
                  <span>{reviewDecisionLabel(item.state)}</span>
                  <span>{formatRelativeTime(item.createdAt)}</span>
                </div>
                {item.body ? (
                  <p className={sx(reviewsStyles.timelineBody)}>
                    {item.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChecksView(props: { checks: GitHubPrCheck[] }) {
  if (props.checks.length === 0) {
    return (
      <p className={sx(reviewsStyles.checksEmpty)}>
        No checks were reported for this head commit.
      </p>
    );
  }
  return (
    <ul className={sx(reviewsStyles.checksList)}>
      {props.checks.map((check, index) => {
        const tone = checkTone(check);
        const Icon =
          tone === "success"
            ? CheckCircle2
            : tone === "fail"
              ? XCircle
              : CircleDot;
        return (
          <li
            key={`${check.name}:${index}`}
            className={sx(reviewsStyles.checkRow)}
          >
            <Icon
              className={sx(
                reviewsStyles.checkIcon,
                tone === "success" && reviewsStyles.checkIconSuccess,
                tone === "fail" && reviewsStyles.checkIconFail,
                tone === "pending" && reviewsStyles.checkIconPending,
              )}
            />
            <span className={sx(reviewsStyles.checkName)}>
              {check.name}
            </span>
            <span className={sx(reviewsStyles.checkStatus)}>
              {check.conclusion || check.status || "pending"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SourceControlReviewsPanel(props: {
  cwd?: string;
  onOpenDiff: (args: {
    detail: GitHubPrReviewDetail;
    file: GitHubPrFile;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<GitHubPrInboxKind>("review-requested");
  const [items, setItems] = useState<GitHubPrInboxItem[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [inboxError, setInboxError] = useState("");
  const [detail, setDetail] = useState<GitHubPrReviewDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailTab, setDetailTab] = useState<ReviewDetailTab>("files");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const inboxRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const loadInbox = useCallback(async () => {
    const listGitHubPrs = window.api?.sourceControl?.listGitHubPrs;
    const requestId = inboxRequestRef.current + 1;
    inboxRequestRef.current = requestId;
    if (!listGitHubPrs) {
      setInboxError("Source Control review bridge unavailable.");
      setIsLoadingInbox(false);
      return;
    }
    setIsLoadingInbox(true);
    setInboxError("");
    try {
      const result = await listGitHubPrs({ kind, limit: 30, cwd: props.cwd });
      if (inboxRequestRef.current !== requestId) {
        return;
      }
      setItems(result.items);
      setInboxError(result.ok ? "" : result.stderr);
    } catch (error) {
      if (inboxRequestRef.current === requestId) {
        setItems([]);
        setInboxError(
          error instanceof Error
            ? error.message
            : "Could not load pull requests.",
        );
      }
    } finally {
      if (inboxRequestRef.current === requestId) {
        setIsLoadingInbox(false);
      }
    }
  }, [kind, props.cwd]);

  const loadDetail = useCallback(
    async (prUrl: string, options?: { openFirstFile?: boolean }) => {
      const getDetail = window.api?.sourceControl?.getGitHubPrReviewDetail;
      const requestId = detailRequestRef.current + 1;
      detailRequestRef.current = requestId;
      if (!getDetail) {
        setDetailError("Source Control review bridge unavailable.");
        return null;
      }
      setIsLoadingDetail(true);
      setDetailError("");
      try {
        const result = await getDetail({ prUrl, cwd: props.cwd });
        if (detailRequestRef.current !== requestId) {
          return null;
        }
        if (!result.ok || !result.detail) {
          setDetail(null);
          setDetailError(result.stderr || "Could not load the pull request.");
          return null;
        }
        setDetail(result.detail);
        if (options?.openFirstFile !== false) {
          const firstDiff = result.detail.files.find((file) =>
            Boolean(file.patch),
          );
          if (firstDiff) {
            await props.onOpenDiff({ detail: result.detail, file: firstDiff });
          }
        }
        return result.detail;
      } catch (error) {
        if (detailRequestRef.current === requestId) {
          setDetail(null);
          setDetailError(
            error instanceof Error
              ? error.message
              : "Could not load the pull request.",
          );
        }
        return null;
      } finally {
        if (detailRequestRef.current === requestId) {
          setIsLoadingDetail(false);
        }
      }
    },
    [props.cwd, props.onOpenDiff],
  );

  useEffect(() => {
    void loadInbox();
    return () => {
      inboxRequestRef.current += 1;
      detailRequestRef.current += 1;
    };
  }, [loadInbox]);

  async function selectPullRequest(item: GitHubPrInboxItem) {
    setDetail(null);
    setDetailTab("files");
    setReviewError("");
    await loadDetail(item.url);
  }

  function returnToInbox() {
    detailRequestRef.current += 1;
    setDetail(null);
    setDetailError("");
    setIsLoadingDetail(false);
    setReviewDialogOpen(false);
  }

  async function submitReview(args: {
    event: GitHubPrReviewEvent;
    body: string;
  }) {
    if (!detail || isSubmittingReview) {
      return;
    }
    const submit = window.api?.sourceControl?.submitGitHubPrReview;
    if (!submit) {
      setReviewError("Source Control review bridge unavailable.");
      return;
    }
    setIsSubmittingReview(true);
    setReviewError("");
    try {
      const result = await submit({
        prUrl: detail.url,
        expectedHeadOid: detail.headRefOid,
        event: args.event,
        body: args.body,
        cwd: props.cwd,
      });
      if (!result.ok) {
        setReviewError(result.stderr || "GitHub rejected the review.");
        if (result.stale) {
          await loadDetail(detail.url, { openFirstFile: false });
        }
        return;
      }
      setReviewDialogOpen(false);
      toast.success(
        args.event === "APPROVE"
          ? "Pull request approved"
          : args.event === "REQUEST_CHANGES"
            ? "Changes requested"
            : "Review comment submitted",
      );
      await Promise.all([
        loadDetail(detail.url, { openFirstFile: false }),
        loadInbox(),
      ]);
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : "Could not submit the review.",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  }

  if (detail || isLoadingDetail || detailError) {
    return (
      <div className={sx(reviewsStyles.shell)}>
        <div className={sx(reviewsStyles.detailHeader)}>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Back to review inbox"
            title="Back to review inbox"
            onClick={returnToInbox}
          >
            <ArrowLeft className={sx(reviewsStyles.iconMd)} />
          </Button>
          <div className={sx(reviewsStyles.detailHeaderText)}>
            <p className={sx(reviewsStyles.breadcrumb)}>
              Reviews
              {detail
                ? ` / ${detail.repositoryWithOwner}#${detail.number}`
                : ""}
            </p>
            {detail ? (
              <p className={sx(reviewsStyles.detailTitle)}>
                {detail.title}
              </p>
            ) : null}
          </div>
          {detail ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Open pull request on GitHub"
              title="Open on GitHub"
              onClick={() =>
                void window.api?.shell?.openExternal?.({ url: detail.url })
              }
            >
              <ExternalLink className={sx(reviewsStyles.iconSm)} />
            </Button>
          ) : null}
        </div>

        {isLoadingDetail ? (
          <div
            className={sx(reviewsStyles.fillStatus)}
            role="status"
          >
            <Loader aria-hidden size="xs" variant="verify" />
            Loading review…
          </div>
        ) : detailError || !detail ? (
          <div
            className={sx(reviewsStyles.errorBox)}
            role="alert"
          >
            <p className={sx(reviewsStyles.errorTitle)}>
              Pull request unavailable
            </p>
            <p className={sx(reviewsStyles.errorDetail)}>
              {detailError || "Could not load the pull request."}
            </p>
          </div>
        ) : (
          <>
            <div className={sx(reviewsStyles.summaryStrip)}>
              <div className={sx(reviewsStyles.badgeRow)}>
                <Badge variant="outline">
                  {reviewDecisionLabel(detail.reviewDecision)}
                </Badge>
                <Badge
                  variant="outline"
                  className={sx(reviewsStyles.monoBadge)}
                >
                  {detail.headRefOid.slice(0, 8)}
                </Badge>
                {detail.isDraft ? (
                  <Badge variant="outline">Draft</Badge>
                ) : null}
              </div>
              <p className={sx(reviewsStyles.summaryLine)}>
                @{detail.authorLogin} · {detail.baseRefName} ←{" "}
                {detail.headRefName} ·{" "}
                <span className={sx(reviewsStyles.additions)}>
                  +{detail.additions}
                </span>{" "}
                <span className={sx(reviewsStyles.deletions)}>
                  -{detail.deletions}
                </span>
              </p>
            </div>

            <Tabs
              value={detailTab}
              onValueChange={(value) => setDetailTab(value as ReviewDetailTab)}
              className={sx(reviewsStyles.tabs)}
            >
              <div className={sx(reviewsStyles.tabStrip)}>
                <TabsList className={sx(reviewsStyles.tabList)}>
                  <TabsTrigger
                    value="files"
                    className={sx(reviewsStyles.tabTrigger)}
                  >
                    Files {detail.changedFiles}
                  </TabsTrigger>
                  <TabsTrigger
                    value="conversation"
                    className={sx(reviewsStyles.tabTrigger)}
                  >
                    Conversation
                  </TabsTrigger>
                  <TabsTrigger
                    value="checks"
                    className={sx(reviewsStyles.tabTrigger)}
                  >
                    Checks {detail.checks.length}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="files"
                className={sx(reviewsStyles.tabPanel)}
              >
                <FilesView
                  detail={detail}
                  onOpenDiff={(file) => props.onOpenDiff({ detail, file })}
                />
              </TabsContent>
              <TabsContent
                value="conversation"
                className={sx(reviewsStyles.tabPanel)}
              >
                <ConversationView detail={detail} />
              </TabsContent>
              <TabsContent
                value="checks"
                className={sx(reviewsStyles.tabPanel)}
              >
                <ChecksView checks={detail.checks} />
              </TabsContent>
            </Tabs>

            <div className={sx(reviewsStyles.detailFooter)}>
              <SourceControlReviewDialog
                open={reviewDialogOpen}
                onOpenChange={(open) => {
                  if (!isSubmittingReview) {
                    setReviewDialogOpen(open);
                    setReviewError("");
                  }
                }}
                detail={detail}
                isSubmitting={isSubmittingReview}
                error={reviewError}
                onSubmit={submitReview}
              />
              {detail.isDraft ? (
                <p className={sx(reviewsStyles.footerNote)}>
                  Draft pull requests cannot be approved yet.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Tabs
      value={kind}
      onValueChange={(value) => setKind(value as GitHubPrInboxKind)}
      className={sx(reviewsStyles.tabs, reviewsStyles.shell)}
    >
      <div className={sx(reviewsStyles.inboxStrip)}>
        <TabsList className={sx(reviewsStyles.tabList)}>
          <TabsTrigger
            value="review-requested"
            className={sx(reviewsStyles.tabTrigger)}
          >
            To review
          </TabsTrigger>
          <TabsTrigger
            value="authored"
            className={sx(reviewsStyles.tabTrigger)}
          >
            My PRs
          </TabsTrigger>
        </TabsList>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh pull request inbox"
          title="Refresh"
          disabled={isLoadingInbox}
          onClick={() => void loadInbox()}
        >
          <RefreshCw
            className={sx(
              reviewsStyles.iconSm,
              isLoadingInbox && reviewsStyles.spinning,
            )}
          />
        </Button>
      </div>
      <TabsContent
        value="review-requested"
        className={sx(reviewsStyles.tabPanel)}
        aria-live="polite"
      >
        <InboxState
          isLoading={isLoadingInbox}
          error={inboxError}
          items={items}
          kind="review-requested"
          onSelect={(item) => void selectPullRequest(item)}
        />
      </TabsContent>
      <TabsContent
        value="authored"
        className={sx(reviewsStyles.tabPanel)}
        aria-live="polite"
      >
        <InboxState
          isLoading={isLoadingInbox}
          error={inboxError}
          items={items}
          kind="authored"
          onSelect={(item) => void selectPullRequest(item)}
        />
      </TabsContent>
      <div className={sx(reviewsStyles.inboxFooter)}>
        <p className={sx(reviewsStyles.inboxFooterText)}>
          <MessageSquare className={sx(reviewsStyles.iconXs)} />
          Reviews are submitted as your signed-in GitHub account.
        </p>
      </div>
    </Tabs>
  );
}
