import { i18n, useTranslation } from "@/i18n";
import { MessageSquarePlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { editorReviewPanelStyles as styles } from "@/components/layout/editor-review-panel.styles";
import { Button, Kbd, Textarea } from "@/components/ui";
import { Tooltip } from "@/components/ads/components/Tooltip";
import type { ReviewComment, ReviewCommentDraft } from "@/types/review";
import type { SentReviewCommentState, SentReviewCommentView } from "@/lib/sent-review-comments";
import type { I18nKey } from "@/i18n";

const SENT_STATE_LABEL_KEYS = {
  changed: "editor:editorReviewPanel.sentLinesChanged",
  unchanged: "editor:editorReviewPanel.sentNotChanged",
  unknown: "editor:editorReviewPanel.sent",
} as const satisfies Record<SentReviewCommentState, I18nKey>;

function stopEditorMouseEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

/** Frames to keep offering focus to a new draft while its zone appears. */
const DRAFT_FOCUS_MAX_FRAMES = 10;

export function EditorReviewPanel(args: {
  line: number;
  draft: ReviewCommentDraft | null;
  comments: ReviewComment[];
  /** Comments already sent to the agent on this line. */
  sentComments?: readonly SentReviewCommentView[];
  onResolveSentComment?: (commentId: string) => void;
  onStartDraft: () => void;
  onDraftBodyChange: (body: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: () => void;
  onRemoveComment: (commentId: string) => void;
}) {
  useTranslation();
  const sentComments = args.sentComments ?? [];
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasDraft = Boolean(args.draft);
  // Monaco adds a view zone hidden and shows it on its next frame, so focus on
  // mount lands nowhere and typing would go into the file. Offer focus to the
  // draft until it can take it.
  useEffect(() => {
    if (!hasDraft) {
      return;
    }
    let frame = 0;
    let attempts = 0;
    const focusDraft = () => {
      const input = draftInputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      if (input.ownerDocument.activeElement !== input && ++attempts < DRAFT_FOCUS_MAX_FRAMES) {
        frame = requestAnimationFrame(focusDraft);
      }
    };
    frame = requestAnimationFrame(focusDraft);
    return () => cancelAnimationFrame(frame);
  }, [hasDraft]);
  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      args.onCancelDraft();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (args.draft?.body.trim()) {
        args.onSubmitDraft();
      }
    }
  };

  return (
    <div
      data-testid="diff-review-thread"
      data-review-line={args.line}
      data-review-side="modified"
      className={sx(styles.thread)}
      onMouseDown={stopEditorMouseEvent}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerLead)}>
          <span className={sx(styles.headerTitle)}>{i18n.t("editor:editorReviewPanel.reviewComment")}</span>
          {args.comments.length > 0 ? (
            <span className={sx(styles.headerMeta)}>{i18n.t("editor:editorReviewPanel.commentCount", { count: args.comments.length })}</span>
          ) : sentComments.length > 0 && !args.draft ? (
            <span className={sx(styles.headerMeta)}>{i18n.t("editor:editorReviewPanel.sentCount", { count: sentComments.length })}</span>
          ) : (
            <span className={sx(styles.headerMeta)}>{i18n.t("editor:editorReviewPanel.newComment")}</span>
          )}
        </div>
        <div className={sx(styles.headerActions)}>
          <span
            className={sx(styles.headerMeta)}
            title={i18n.t("editor:editorReviewPanel.commentOnModifiedLine", { value1: args.line })}
          >
            {i18n.t("editor:editorReviewPanel.commentOn")}{" "}
            <span className={sx(styles.lineRef)}>R{args.line}</span>
          </span>
          {!args.draft ? (
            <Tooltip content={i18n.t("editor:editorReviewPanel.addAnotherCommentOnModifiedLine", { value1: args.line })}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={styles.addButton}
                onClick={args.onStartDraft}
                aria-label={i18n.t("editor:editorReviewPanel.addAnotherCommentOnModifiedLine", { value1: args.line })}
              >
                <MessageSquarePlus />
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {args.comments.length > 0 ? (
        <div className={sx(styles.commentList)}>
          {args.comments.map((comment) => (
            <div key={comment.id} className={sx(styles.commentRow)}>
              <p className={sx(styles.commentBody)}>{comment.body}</p>
              <Tooltip content={i18n.t("editor:editorReviewPanel.removeCommentFromLine", { value1: args.line })}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={styles.removeButton}
                  onClick={() => args.onRemoveComment(comment.id)}
                  aria-label={i18n.t("editor:editorReviewPanel.removeCommentFromLine", { value1: args.line })}
                >
                  <Trash2 />
                </Button>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : null}

      {sentComments.length > 0 ? (
        <div className={sx(styles.commentList)}>
          {sentComments.map(({ comment, state }) => (
            <div key={comment.id} className={sx(styles.commentRow, styles.sentRow)}>
              <div className={sx(styles.sentBody)}>
                <span className={sx(styles.sentState, state === "changed" && styles.sentStateChanged)}>
                  {i18n.t(SENT_STATE_LABEL_KEYS[state])}
                </span>
                <p className={sx(styles.commentBody)}>{comment.body}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={styles.resolveButton}
                onClick={() => args.onResolveSentComment?.(comment.id)}
                aria-label={i18n.t("editor:editorReviewPanel.resolveSentCommentOnLine", { value1: args.line })}
              >
                {i18n.t("editor:editorReviewPanel.resolve")}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {args.draft ? (
        <div className={sx(styles.draft)}>
          <Textarea
            ref={draftInputRef}
            value={args.draft.body}
            onChange={(event) => args.onDraftBodyChange(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            xstyle={styles.draftInput}
            placeholder={i18n.t("editor:editorReviewPanel.leaveACommentOnLine", { value1: args.line })}
            aria-label={i18n.t("editor:editorReviewPanel.commentOnModifiedLine", { value1: args.line })}
          />
          <div className={sx(styles.draftFooter)}>
            <span className={sx(styles.draftHint)}>
              <Kbd>
                {typeof navigator !== "undefined" &&
                navigator.platform.includes("Mac")
                  ? "⌘"
                  : "Ctrl"}
              </Kbd>
              <Kbd>Enter</Kbd>
              {i18n.t("editor:editorReviewPanel.toSave")}
            </span>
            <div className={sx(styles.draftActions)}>
              <Tooltip content={i18n.t("editor:editorReviewPanel.cancelReviewComment")}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={styles.cancelButton}
                  onClick={args.onCancelDraft}
                  aria-label={i18n.t("editor:editorReviewPanel.cancelReviewComment")}
                >
                  <X />
                </Button>
              </Tooltip>
              <Button
                type="button"
                size="sm"
                xstyle={styles.submitButton}
                disabled={!args.draft.body.trim()}
                onClick={args.onSubmitDraft}
              >
                {i18n.t("editor:editorReviewPanel.addComment")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
