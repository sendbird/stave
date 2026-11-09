import { i18n, Trans, useTranslation, type I18nKey } from "@/i18n";
import { useId, useMemo } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { formatDateTime } from "@/i18n/format";
import { isSnapshotDiffEditorTab } from "@/lib/editor/snapshot-diff-tabs";
import {
  classifySentReviewComment,
  type SentReviewComment,
  type SentReviewCommentState,
} from "@/lib/sent-review-comments";
import { useAppStore } from "@/store/app.store";
import { EMPTY_SENT_REVIEW_COMMENTS, useSentReviewCommentsStore } from "@/store/sent-review-comments-store";
import type { ReviewComment } from "@/types/review";
import { reviewStyles as styles } from "./review.styles";
import { commentJumpMarker } from "./review-comment.stylex";

const NO_COMMENTS: readonly ReviewComment[] = [];

/** The editor's words for a sent comment's lines, so both places say the same thing. */
const SENT_STATE_LABEL_KEYS = {
  changed: "editor:editorReviewPanel.sentLinesChanged",
  unchanged: "editor:editorReviewPanel.sentNotChanged",
  unknown: "editor:editorReviewPanel.sent",
} as const satisfies Record<SentReviewCommentState, I18nKey>;

/** A file's current text that Review has read: the selected file's working-tree side. */
export interface ReviewLoadedFile {
  path: string;
  content: string;
}

function describeWhere(comment: ReviewComment) {
  return comment.line ? i18n.t("review:comments.where", { path: comment.filePath, line: comment.line }) : comment.filePath;
}

/**
 * Review's list of the task's diff comments, not sent and sent. A row opens
 * its file at its line; a pending comment can be removed before it is sent;
 * a sent one says whether its lines changed since and can be resolved. The
 * editor's comment zones hold the same comments; this list is the one screen
 * readers reach.
 */
export function ReviewComments(props: {
  taskId: string;
  onJump?: (comment: ReviewComment) => void;
  /** The file Review shows now, read from the working tree; the sent check reads it. */
  loadedFile?: ReviewLoadedFile | null;
}) {
  useTranslation();
  const pending = useAppStore((state) => state.reviewCommentsByTask[props.taskId] ?? NO_COMMENTS);
  const removeReviewComment = useAppStore((state) => state.removeReviewComment);
  const sent = useSentReviewCommentsStore((state) => state.byTask[props.taskId] ?? EMPTY_SENT_REVIEW_COMMENTS);
  const resolve = useSentReviewCommentsStore((state) => state.resolve);
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("review:comments.title")} data-testid="review-comments">
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("review:comments.title")}</h3>
      {pending.length === 0 && sent.length === 0 ? <p className={sx(styles.note)}>{i18n.t("review:comments.none")}</p> : null}
      {pending.length ? (
        <>
          <h4 className={sx(styles.groupTitle)}>{i18n.t("review:comments.pending", { count: pending.length })}</h4>
          <ul className={sx(styles.list)} data-testid="review-comments-pending">
            {pending.map((comment) => (
              <li key={comment.id} className={sx(styles.commentRow)}>
                <CommentJump comment={comment} onJump={props.onJump} />
                <Button
                  size="xs"
                  variant="quiet"
                  iconOnly
                  xstyle={styles.commentRemove}
                  data-review-comment-remove=""
                  aria-label={i18n.t("review:comments.remove", { where: describeWhere(comment) })}
                  onClick={() => removeReviewComment({ taskId: props.taskId, commentId: comment.id })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {sent.length ? (
        <>
          <h4 className={sx(styles.groupTitle)}>{i18n.t("review:comments.sent", { count: sent.length })}</h4>
          <ul className={sx(styles.list)} data-testid="review-comments-sent">
            {sent.map((entry) => (
              <SentCommentRow
                key={entry.comment.id}
                entry={entry}
                loadedFile={props.loadedFile ?? null}
                onJump={props.onJump}
                onResolve={() => resolve({ taskId: props.taskId, commentId: entry.comment.id })}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** The row itself: `path:line` and the comment, one button that opens the line. */
function CommentJump(props: { comment: ReviewComment; sentAt?: string; onJump?: (comment: ReviewComment) => void }) {
  useTranslation();
  const bodyId = useId();
  const where = describeWhere(props.comment);
  const jumps = Boolean(props.onJump);
  const whereLine = (
    <span className={sx(styles.commentWhereLine)}>
      <span className={sx(styles.commentWhereHead)}>
        <span className={sx(styles.commentWhere)} title={where} data-review-comment-where="">{where}</span>
        {jumps ? <ArrowUpRight aria-hidden className={sx(styles.commentJumpIcon)} data-review-comment-jump-icon="" /> : null}
      </span>
      {props.sentAt ? (
        <span className={sx(styles.commentSentAt)} data-review-comment-sent-at="">
          <Trans ns="review" i18nKey="comments.sentAt" components={{ time: <time dateTime={props.sentAt}>{formatDateTime(props.sentAt)}</time> }} />
        </span>
      ) : null}
    </span>
  );
  if (!jumps) {
    return (
      <div className={sx(styles.comment)}>
        {whereLine}
        <p className={sx(styles.commentBody)}>{props.comment.body}</p>
      </div>
    );
  }
  return (
    <Button
      layout="host"
      type="button"
      xstyle={[styles.commentJump, focusRing.ringInset, commentJumpMarker]}
      aria-label={i18n.t("review:comments.jump", { where })}
      aria-describedby={bodyId}
      onClick={() => props.onJump?.(props.comment)}
    >
      {whereLine}
      <span id={bodyId} className={sx(styles.commentBody)}>{props.comment.body}</span>
    </Button>
  );
}

function SentCommentRow(props: {
  entry: SentReviewComment;
  loadedFile: ReviewLoadedFile | null;
  onJump?: (comment: ReviewComment) => void;
  onResolve: () => void;
}) {
  useTranslation();
  const { comment } = props.entry;
  // The file as it reads now: an open editor tab of it, else the file Review
  // shows; without either, Stave cannot tell and says only "Sent".
  const tabContent = useAppStore((state) =>
    state.editorTabs.find((tab) => tab.filePath === comment.filePath && !isSnapshotDiffEditorTab(tab))?.content);
  const current = tabContent ?? (props.loadedFile?.path === comment.filePath ? props.loadedFile.content : undefined);
  const state = useMemo<SentReviewCommentState>(
    () => current === undefined
      ? "unknown"
      : classifySentReviewComment({
          anchor: props.entry.anchor,
          line: comment.side === "original" ? undefined : comment.line,
          currentLines: current.split("\n"),
        }),
    [comment.line, comment.side, current, props.entry.anchor],
  );
  return (
    <li className={sx(styles.commentStack)} data-sent-state={state}>
      <CommentJump comment={comment} sentAt={props.entry.sentAt} onJump={props.onJump} />
      <span className={sx(styles.commentSentRow)}>
        <span className={sx(styles.commentSentState, state === "changed" && styles.commentSentStateChanged)}>
          {i18n.t(SENT_STATE_LABEL_KEYS[state])}
        </span>
        <Button
          size="xs"
          variant="quiet"
          aria-label={i18n.t("review:comments.resolve", { where: describeWhere(comment) })}
          onClick={props.onResolve}
        >
          {i18n.t("editor:editorReviewPanel.resolve")}
        </Button>
      </span>
    </li>
  );
}
