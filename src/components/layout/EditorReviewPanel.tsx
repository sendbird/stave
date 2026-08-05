import { MessageSquarePlus, Trash2, X } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
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
      className="mx-3 my-1 overflow-hidden rounded-md border border-border/80 border-l-2 border-l-primary bg-editor text-editor-foreground shadow-sm"
      onMouseDown={stopEditorMouseEvent}
    >
      <div className="flex min-h-8 items-center justify-between gap-2 border-b border-border/60 bg-editor-muted/55 px-2.5 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold text-foreground">
            Review comment
          </span>
          {args.comments.length > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {args.comments.length} comment
              {args.comments.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              New comment
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="text-[10px] text-muted-foreground"
            title={`Comment on modified line ${args.line}`}
          >
            Comment on{" "}
            <span className="font-mono font-semibold tabular-nums text-foreground">
              R{args.line}
            </span>
          </span>
          {!args.draft ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground"
              onClick={args.onStartDraft}
              aria-label={`Add another comment on modified line ${args.line}`}
            >
              <MessageSquarePlus className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {args.comments.length > 0 ? (
        <div className="flex flex-col divide-y divide-border/50">
          {args.comments.map((comment) => (
            <div
              key={comment.id}
              className="flex items-start gap-2 px-2.5 py-2"
            >
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                {comment.body}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 rounded-sm p-0 text-muted-foreground hover:text-destructive"
                onClick={() => args.onRemoveComment(comment.id)}
                aria-label={`Remove comment from line ${args.line}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {args.draft ? (
        <div className="border-t border-border/50 px-2.5 py-2">
          <Textarea
            autoFocus
            value={args.draft.body}
            onChange={(event) => args.onDraftBodyChange(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            className="min-h-16 resize-none bg-background text-xs leading-5"
            placeholder={`Leave a comment on line ${args.line}`}
            aria-label={`Comment on modified line ${args.line}`}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {typeof navigator !== "undefined" &&
              navigator.platform.includes("Mac")
                ? "⌘"
                : "Ctrl"}
              +Enter to save
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                onClick={args.onCancelDraft}
                aria-label="Cancel review comment"
              >
                <X className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
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
