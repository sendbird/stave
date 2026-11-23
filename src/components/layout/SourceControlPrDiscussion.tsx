import { Badge, Button, Loader, Textarea } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { GITHUB_PR_REVIEW_LIMITS } from "@/lib/github-pr-review";
import type { GitHubPrActivityArgs } from "@/lib/github-pr-activity";
import type { PrReviewComment, PrReviewThread } from "@/lib/pr-context";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { reviewsStyles as styles } from "./source-control-reviews-panel.styles";
import { prActivityError, requestPrActivity, usePrActivityRead, type PrActivityTarget } from "./use-github-pr-activity";

type DiscussionWrite = Extract<GitHubPrActivityArgs, { action: "comment" | "reply" | "resolve" }>;
type WriteStatus = { busy: boolean; threadId?: string; error?: string; saved?: boolean };

function WriteFeedback({ status }: { status?: WriteStatus }) {
  const { t } = useTranslation("sourceControl");
  if (status?.error) return <p role="alert" className={sx(styles.activityError)}>{status.error}</p>;
  if (status?.saved) return <p role="status" className={sx(styles.mutedText)}>{t("prActivity.savedOnGitHub")}</p>;
  return null;
}

function CommentList({ comments }: { comments: PrReviewComment[] }) {
  const { t } = useTranslation("sourceControl");
  return (
    <ul className={sx(styles.activityList)}>
      {comments.map((comment) => (
        <li key={comment.id}>
          <div className={sx(styles.timelineMeta)}>
            <span className={sx(styles.timelineAuthor)}>
              {comment.author ? `@${comment.author}` : t("sourceControlReviewsPanel.unknown")}
            </span>
            <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
            {comment.commitSha ? <code>{comment.commitSha.slice(0, 8)}</code> : null}
          </div>
          <p className={sx(styles.timelineBody)}>{comment.body}</p>
        </li>
      ))}
    </ul>
  );
}

function CommentForm(props: {
  disabled: boolean;
  isReply?: boolean;
  onPost: (body: string) => Promise<boolean>;
  onClose?: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  const [body, setBody] = useState("");
  const id = useId();
  return (
    <form className={sx(styles.conversationSection)} onSubmit={async (event) => {
      event.preventDefault();
      if (props.disabled || !body.trim()) return;
      if (await props.onPost(body)) {
        setBody("");
        props.onClose?.();
      }
    }}>
      <label htmlFor={id} className={sx(styles.sectionLabel)}>
        {props.isReply ? t("prActivity.reply") : t("prActivity.addComment")}
      </label>
      <Textarea id={id} value={body} onChange={(event) => setBody(event.target.value)} rows={2}
        disabled={props.disabled} xstyle={styles.activityTextarea} maxLength={GITHUB_PR_REVIEW_LIMITS.maxBodyChars} />
      <div className={sx(styles.activityActions)}>
        <Button type="submit" variant="outline" size="sm" disabled={props.disabled || !body.trim()}>
          {props.isReply ? t("prActivity.postReply") : t("prActivity.postComment")}
        </Button>
        {props.onClose ? (
          <Button type="button" variant="ghost" size="sm" disabled={props.disabled} onClick={props.onClose}>
            {t("prActivity.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ReviewThread(props: {
  thread: PrReviewThread;
  status?: WriteStatus;
  disabled: boolean;
  onReply: (body: string) => Promise<boolean>;
  onResolve: (resolved: boolean) => void;
}) {
  const { t } = useTranslation("sourceControl");
  const [replying, setReplying] = useState(false);
  const { thread } = props;
  const line = thread.isOutdated ? thread.originalLine ?? thread.line : thread.line;
  return (
    <li className={sx(styles.timelineItem, styles.conversationSection)}>
      <div className={sx(styles.activityActions)}>
        <span className={sx(styles.threadPath)}>
          {thread.path || t("prContextDialog.noFile")}{line === null ? "" : `:${formatNumber(line)}`}
        </span>
        {thread.isOutdated ? <Badge variant="outline">{t("prActivity.outdated")}</Badge> : null}
        <Badge variant="outline">{thread.isResolved ? t("prActivity.resolved") : t("prActivity.unresolved")}</Badge>
      </div>
      {thread.truncatedComments > 0 ? <p className={sx(styles.mutedText)}>{t("prActivity.omittedComments", { count: thread.truncatedComments })}</p> : null}
      <CommentList comments={thread.comments} />
      <div className={sx(styles.activityActions)}>
        {thread.viewerCanReply && !replying ? (
          <Button type="button" variant="ghost" size="sm" disabled={props.disabled} onClick={() => setReplying(true)}>
            {t("prActivity.reply")}
          </Button>
        ) : null}
        {(thread.isResolved ? thread.viewerCanUnresolve : thread.viewerCanResolve) ? (
          <Button type="button" variant="ghost" size="sm" disabled={props.disabled} onClick={() => props.onResolve(!thread.isResolved)}>
            {thread.isResolved ? t("prActivity.unresolve") : t("prActivity.resolve")}
          </Button>
        ) : null}
      </div>
      <WriteFeedback status={props.status} />
      {replying ? <CommentForm isReply disabled={props.disabled || !thread.viewerCanReply} onPost={props.onReply} onClose={() => setReplying(false)} /> : null}
    </li>
  );
}

export function SourceControlPrDiscussion({ prUrl, cwd, initialComments }: PrActivityTarget & { initialComments: PrReviewComment[] }) {
  const { t } = useTranslation("sourceControl");
  const request = useCallback(() => requestPrActivity({ action: "discussion", prUrl, cwd }, "discussion"), [prUrl, cwd]);
  const { value, loading, error, refresh } = usePrActivityRead<"discussion">(request);
  const [status, setStatus] = useState<WriteStatus>({ busy: false });
  const writing = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function write(args: DiscussionWrite) {
    if (writing.current) return false;
    writing.current = true;
    const threadId = args.action === "comment" ? undefined : args.threadId;
    setStatus({ busy: true, threadId });
    try {
      await requestPrActivity(args, "written");
      if (active.current) {
        setStatus({ busy: true, saved: true, threadId });
        await refresh();
        if (active.current) setStatus({ busy: false, saved: true, threadId });
      }
      return true;
    } catch (cause) {
      if (active.current) setStatus({ busy: false, error: prActivityError(cause), threadId });
      return false;
    } finally {
      writing.current = false;
    }
  }

  const disabled = loading || status.busy || !!error;
  return (
    <>
      <section className={sx(styles.conversationSection)}>
        <div className={sx(styles.activityActions)}>
          <h3 className={sx(styles.sectionLabel)}>{t("prActivity.comments")}</h3>
          <Button type="button" variant="ghost" size="sm" disabled={loading || status.busy} onClick={() => void refresh()}>
            {t("sourceControlReviewsPanel.refresh")}
          </Button>
        </div>
        {loading ? <Loader role="status" aria-label={t("sourceControlReviewsPanel.loadingReview")} size="xs" /> : null}
        {error ? <p role="alert" className={sx(styles.activityError)}>{error}</p> : null}
        {!value && initialComments.length ? <CommentList comments={initialComments} /> : null}
        {value ? (
          <>
            {value.omittedComments > 0 ? <p className={sx(styles.mutedText)}>{t("prActivity.omittedComments", { count: value.omittedComments })}</p> : null}
            {value.comments.length ? <CommentList comments={value.comments} /> : <p className={sx(styles.mutedText)}>{t("prActivity.noComments")}</p>}
            <WriteFeedback status={status.threadId ? undefined : status} />
            <CommentForm disabled={disabled} onPost={(body) => write({ action: "comment", prUrl, cwd, body })} />
          </>
        ) : null}
      </section>
      {value ? (
        <section className={sx(styles.conversationSection)}>
          <h3 className={sx(styles.sectionLabel)}>{t("prContextDialog.reviewThreads")}</h3>
          {value.omittedThreads > 0 ? <p className={sx(styles.mutedText)}>{t("prActivity.omittedThreads", { count: value.omittedThreads })}</p> : null}
          {value.threads.length ? (
            <ul className={sx(styles.activityList)}>
              {value.threads.map((thread) => (
                <ReviewThread key={thread.id} thread={thread} disabled={disabled} status={status.threadId === thread.id ? status : undefined}
                  onReply={(body) => write({ action: "reply", prUrl, cwd, threadId: thread.id, body })}
                  onResolve={(resolved) => void write({ action: "resolve", prUrl, cwd, threadId: thread.id, resolved })} />
              ))}
            </ul>
          ) : <p className={sx(styles.mutedText)}>{t("prContextDialog.noReviewThreadsOnThisPullRequest")}</p>}
        </section>
      ) : null}
    </>
  );
}
