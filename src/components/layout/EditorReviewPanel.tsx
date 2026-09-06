import { MessageSquarePlus, Trash2, X } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { editorReviewPanelStyles as styles } from "@/components/layout/editor-review-panel.styles";
import { Button, Textarea } from "@/components/ui";
import type { ReviewComment, ReviewCommentDraft } from "@/types/review";

function stopEditorMouseEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function EditorReviewPanel(args: {
  line: number;
  draft: ReviewCommentDraft | null;
  comments: ReviewComment[];
  onStartDraft: () => void;
  onDraftBodyChange: (body: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: () => void;
  onRemoveComment: (commentId: string) => void;
}) {
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
          <span className={sx(styles.headerTitle)}>Review comment</span>
          {args.comments.length > 0 ? (
            <span className={sx(styles.headerMeta)}>
              {args.comments.length} comment
              {args.comments.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className={sx(styles.headerMeta)}>New comment</span>
          )}
        </div>
        <div className={sx(styles.headerActions)}>
          <span
            className={sx(styles.headerMeta)}
            title={`Comment on modified line ${args.line}`}
          >
            Comment on{" "}
            <span className={sx(styles.lineRef)}>R{args.line}</span>
          </span>
          {!args.draft ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={styles.addButton}
              onClick={args.onStartDraft}
              aria-label={`Add another comment on modified line ${args.line}`}
            >
              <MessageSquarePlus />
            </Button>
          ) : null}
        </div>
      </div>

      {args.comments.length > 0 ? (
        <div className={sx(styles.commentList)}>
          {args.comments.map((comment) => (
            <div key={comment.id} className={sx(styles.commentRow)}>
              <p className={sx(styles.commentBody)}>{comment.body}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={styles.removeButton}
                onClick={() => args.onRemoveComment(comment.id)}
                aria-label={`Remove comment from line ${args.line}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {args.draft ? (
        <div className={sx(styles.draft)}>
          <Textarea
            autoFocus
            value={args.draft.body}
            onChange={(event) => args.onDraftBodyChange(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            xstyle={styles.draftInput}
            placeholder={`Leave a comment on line ${args.line}`}
            aria-label={`Comment on modified line ${args.line}`}
          />
          <div className={sx(styles.draftFooter)}>
            <span className={sx(styles.draftHint)}>
              {typeof navigator !== "undefined" &&
              navigator.platform.includes("Mac")
                ? "⌘"
                : "Ctrl"}
              +Enter to save
            </span>
            <div className={sx(styles.draftActions)}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={styles.cancelButton}
                onClick={args.onCancelDraft}
                aria-label="Cancel review comment"
              >
                <X />
              </Button>
              <Button
                type="button"
                size="sm"
                xstyle={styles.submitButton}
                disabled={!args.draft.body.trim()}
                onClick={args.onSubmitDraft}
              >
                Add comment
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
