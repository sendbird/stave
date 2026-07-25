import { Send, Trash2, X } from "lucide-react";
import type { ReviewComment, ReviewCommentSide } from "@/types/review";
import {
  Button,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";

export interface EditorReviewDraft {
  filePath: string;
  line?: number;
  side: ReviewCommentSide;
  body: string;
}

function formatReviewLocation(args: {
  side?: ReviewCommentSide;
  line?: number;
}) {
  const sideLabel = args.side === "original" ? "original" : "modified";
  return args.line ? `${sideLabel}:${args.line}` : sideLabel;
}

export function EditorReviewPanel(args: {
  draft: EditorReviewDraft | null;
  comments: ReviewComment[];
  totalCount: number;
  submitDisabled: boolean;
  onDraftBodyChange: (body: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: () => void;
  onRemoveComment: (commentId: string) => void;
  onSendReview: () => void;
}) {
  if (!args.draft && args.comments.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border/70 bg-editor px-3 py-2">
      <TooltipProvider>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-foreground">
              Review comments
              {args.totalCount > 0 ? (
                <span className="ml-2 text-muted-foreground">
                  {args.totalCount}
                </span>
              ) : null}
            </p>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  disabled={args.submitDisabled}
                  onClick={args.onSendReview}
                  aria-label="Send review to agent"
                >
                  <Send className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Send review to agent
              </TooltipContent>
            </Tooltip>
          </div>

          {args.draft ? (
            <div className="rounded-md border border-border/70 bg-background/70 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {args.draft.filePath} - {formatReviewLocation(args.draft)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 rounded-sm p-0 text-muted-foreground"
                  onClick={args.onCancelDraft}
                  aria-label="Cancel review comment"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <Textarea
                value={args.draft.body}
                onChange={(event) => args.onDraftBodyChange(event.target.value)}
                className="min-h-20 resize-y bg-background text-xs"
                placeholder="Review comment"
              />
              <div className="mt-2 flex justify-end">
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
          ) : null}

          {args.comments.length > 0 ? (
            <div className="flex flex-col gap-1">
              {args.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {formatReviewLocation(comment)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-foreground">
                      {comment.body}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 rounded-sm p-0 text-muted-foreground"
                          onClick={() => args.onRemoveComment(comment.id)}
                          aria-label="Remove review comment"
                        />
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Remove comment
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </TooltipProvider>
    </div>
  );
}
