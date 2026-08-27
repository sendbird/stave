import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  LoaderCircle,
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
import { cn } from "@/lib/utils";
import { SourceControlReviewDialog } from "./SourceControlReviewDialog";

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
      <button
        type="button"
        className="group flex min-h-16 w-full min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 text-start outline-none transition-colors hover:bg-muted/55 focus-visible:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/35"
        onClick={props.onSelect}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
          <GitPullRequest className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{props.item.repositoryWithOwner}</span>
            <span className="shrink-0">#{props.item.number}</span>
            {props.item.isDraft ? (
              <Badge
                variant="outline"
                className="h-5 shrink-0 px-1.5 text-[10px]"
              >
                Draft
              </Badge>
            ) : null}
          </span>
          <span className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-foreground">
            {props.item.title || "Untitled pull request"}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
            <span>
              {props.kind === "review-requested"
                ? `Review requested by @${props.item.authorLogin || "unknown"}`
                : `${props.item.commentsCount} comments`}
            </span>
            <span>{formatRelativeTime(props.item.updatedAt)}</span>
          </span>
        </span>
      </button>
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
        className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" />
        Loading pull requests…
      </div>
    );
  }
  if (props.error) {
    return (
      <div
        className="m-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Reviews unavailable
            </p>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              {props.error}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (props.items.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">
          {props.kind === "review-requested"
            ? "No reviews waiting"
            : "No open pull requests"}
        </p>
        <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">
          {props.kind === "review-requested"
            ? "Pull requests requesting your review will appear here."
            : "Open pull requests authored by you will appear here."}
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-0.5 p-1.5">
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
    <div className="space-y-2 p-2">
      {props.detail.filesError ? (
        <p className="rounded-lg bg-warning/8 px-3 py-2 text-xs leading-5 text-warning">
          {props.detail.filesError}
        </p>
      ) : null}
      {props.detail.files.map((file) => (
        <button
          key={file.path}
          type="button"
          className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-start outline-none transition-colors hover:bg-muted/55 focus-visible:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!file.patch}
          onClick={() => void props.onOpenDiff(file)}
          title={
            file.patch
              ? `Open ${file.path}`
              : "GitHub did not return a patch for this file"
          }
        >
          <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {file.path}
          </span>
          <span className="shrink-0 font-mono text-[10px]">
            <span className="text-success">+{file.additions}</span>{" "}
            <span className="text-destructive">-{file.deletions}</span>
          </span>
        </button>
      ))}
      {props.detail.filesTruncated ? (
        <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">
          Showing the first {props.detail.files.length} of{" "}
          {props.detail.changedFiles} files.
        </p>
      ) : null}
    </div>
  );
}

function ConversationView(props: { detail: GitHubPrReviewDetail }) {
  return (
    <div className="space-y-4 px-3 py-3">
      <section className="space-y-2">
        <p className="text-xs font-medium text-foreground">Description</p>
        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
          {props.detail.body || "No description provided."}
        </p>
      </section>
      <section className="space-y-2">
        <p className="text-xs font-medium text-foreground">Activity</p>
        {props.detail.timeline.length === 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">
            No submitted reviews or comments yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {props.detail.timeline.map((item) => (
              <li key={item.id} className="rounded-lg bg-muted/35 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    @{item.authorLogin || "unknown"}
                  </span>
                  <span>{reviewDecisionLabel(item.state)}</span>
                  <span>{formatRelativeTime(item.createdAt)}</span>
                </div>
                {item.body ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">
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
      <p className="px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
        No checks were reported for this head commit.
      </p>
    );
  }
  return (
    <ul className="space-y-1 p-2">
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
            className="flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2"
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                tone === "success" && "text-success",
                tone === "fail" && "text-destructive",
                tone === "pending" && "text-warning",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {check.name}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-12 items-center gap-2 border-b border-border/80 px-2 py-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Back to review inbox"
            title="Back to review inbox"
            onClick={returnToInbox}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-muted-foreground">
              Reviews
              {detail
                ? ` / ${detail.repositoryWithOwner}#${detail.number}`
                : ""}
            </p>
            {detail ? (
              <p className="truncate text-xs font-medium text-foreground">
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
              <ExternalLink className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {isLoadingDetail ? (
          <div
            className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Loading review…
          </div>
        ) : detailError || !detail ? (
          <div
            className="m-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3"
            role="alert"
          >
            <p className="text-sm font-medium text-foreground">
              Pull request unavailable
            </p>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              {detailError || "Could not load the pull request."}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 border-b border-border/70 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {reviewDecisionLabel(detail.reviewDecision)}
                </Badge>
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 font-mono text-[10px]"
                >
                  {detail.headRefOid.slice(0, 8)}
                </Badge>
                {detail.isDraft ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    Draft
                  </Badge>
                ) : null}
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                @{detail.authorLogin} · {detail.baseRefName} ←{" "}
                {detail.headRefName} ·{" "}
                <span className="text-success">+{detail.additions}</span>{" "}
                <span className="text-destructive">-{detail.deletions}</span>
              </p>
            </div>

            <Tabs
              value={detailTab}
              onValueChange={(value) => setDetailTab(value as ReviewDetailTab)}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="border-b border-border/70 px-2 py-1.5">
                <TabsList className="h-auto w-full justify-start rounded-lg bg-muted/35 p-1">
                  <TabsTrigger
                    value="files"
                    className="h-7 flex-1 rounded-md px-2 text-[11px]"
                  >
                    Files {detail.changedFiles}
                  </TabsTrigger>
                  <TabsTrigger
                    value="conversation"
                    className="h-7 flex-1 rounded-md px-2 text-[11px]"
                  >
                    Conversation
                  </TabsTrigger>
                  <TabsTrigger
                    value="checks"
                    className="h-7 flex-1 rounded-md px-2 text-[11px]"
                  >
                    Checks {detail.checks.length}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="files"
                className="min-h-0 flex-1 overflow-auto"
              >
                <FilesView
                  detail={detail}
                  onOpenDiff={(file) => props.onOpenDiff({ detail, file })}
                />
              </TabsContent>
              <TabsContent
                value="conversation"
                className="min-h-0 flex-1 overflow-auto"
              >
                <ConversationView detail={detail} />
              </TabsContent>
              <TabsContent
                value="checks"
                className="min-h-0 flex-1 overflow-auto"
              >
                <ChecksView checks={detail.checks} />
              </TabsContent>
            </Tabs>

            <div className="shrink-0 border-t border-border/80 bg-card px-3 py-2.5">
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
                <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
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
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="flex items-center gap-2 border-b border-border/80 px-2 py-1.5">
        <TabsList className="h-auto min-w-0 flex-1 justify-start rounded-lg bg-muted/35 p-1">
          <TabsTrigger
            value="review-requested"
            className="h-8 flex-1 rounded-md px-2 text-xs"
          >
            To review
          </TabsTrigger>
          <TabsTrigger
            value="authored"
            className="h-8 flex-1 rounded-md px-2 text-xs"
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
            className={cn("size-3.5", isLoadingInbox && "animate-spin")}
          />
        </Button>
      </div>
      <TabsContent
        value="review-requested"
        className="min-h-0 flex-1 overflow-auto"
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
        className="min-h-0 flex-1 overflow-auto"
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
      <div className="shrink-0 border-t border-border/70 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MessageSquare className="size-3" />
          Reviews are submitted as your signed-in GitHub account.
        </p>
      </div>
    </Tabs>
  );
}
