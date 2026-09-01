import { Pencil, Send, Trash2, Zap } from "lucide-react";
import { Badge, Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PromptDraftQueuedTurn } from "@/types/chat";
import type { ModelSelectorOption } from "./model-selector.utils";
import { describeQueuedTurnDispatch } from "./prompt-input-queued-turn";

export function PromptInputQueuedTurns(args: {
  queuedTurns: readonly PromptDraftQueuedTurn[];
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  isTurnActive?: boolean | undefined;
  canSteerQueuedTurnNow: boolean;
  canSendQueuedTurnNow: boolean;
  queuedFileCount: number;
  queuedImageCount: number;
  editingQueuedTurnId: string | null;
  editingQueuedTurnContent: string;
  onEditingQueuedTurnContentChange: (value: string) => void;
  onStartEdit: (item: PromptDraftQueuedTurn) => void;
  onCancelEdit: () => void;
  onSaveEdit: (itemId: string) => void;
  onClearAll?: () => void;
  onSteer?: (itemId: string) => void;
  onSend?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-[0_10px_28px_-18px_oklch(0_0_0/0.28),0_2px_7px_-4px_oklch(0_0_0/0.16)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="secondary"
          className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
        >
          Queue
        </Badge>
        <span className="text-xs text-muted-foreground">
          {args.queuedTurns.length} queued follow-up
          {args.queuedTurns.length === 1 ? "" : "s"}
          {args.isTurnActive
            ? args.canSteerQueuedTurnNow
              ? " · next sends automatically when the current response finishes, or steer one into it now"
              : " · next sends automatically when the current response finishes"
            : args.canSendQueuedTurnNow
              ? " · send one now, or it sends after your next message finishes"
              : ""}
        </span>
        {args.queuedFileCount > 0 ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {args.queuedFileCount}{" "}
            {args.queuedFileCount === 1 ? "file" : "files"}
          </Badge>
        ) : null}
        {args.queuedImageCount > 0 ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {args.queuedImageCount}{" "}
            {args.queuedImageCount === 1 ? "image" : "images"}
          </Badge>
        ) : null}
        {args.onClearAll ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => args.onClearAll?.()}
            className="ml-auto h-7 px-2 text-xs"
          >
            Clear all
          </Button>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {args.queuedTurns.map((item, index) => {
          const isEditing = args.editingQueuedTurnId === item.id;
          const summary =
            item.content.replace(/\s+/g, " ").trim() ||
            "Queued follow-up with attached context.";
          const dispatch = describeQueuedTurnDispatch({
            queuedTurn: item,
            selection: args.selectedModel,
            modelOptions: args.modelOptions,
          });
          return (
            <div
              key={item.id}
              className={cn(
                "group relative rounded-lg border border-border/50 bg-background/80 px-2.5 py-2 shadow-sm transition-all hover:border-border hover:shadow-md",
                index === 0 && !isEditing && "border-primary/30",
              )}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={args.editingQueuedTurnContent}
                    onChange={(event) =>
                      args.onEditingQueuedTurnContentChange(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.altKey &&
                        !event.ctrlKey &&
                        !event.metaKey
                      ) {
                        event.preventDefault();
                        args.onSaveEdit(item.id);
                      }
                    }}
                    className="min-h-20 resize-y text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={args.onCancelEdit}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => args.onSaveEdit(item.id)}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                      {summary}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-xs font-medium",
                        dispatch.mismatchesComposer
                          ? "text-warning"
                          : index === 0
                            ? "text-primary/80"
                            : "text-muted-foreground",
                      )}
                    >
                      {index === 0 ? "Next to send · " : ""}
                      {dispatch.caption}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    {args.canSteerQueuedTurnNow &&
                    item.attachedFilePaths.length === 0 &&
                    item.attachments.length === 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-primary"
                        aria-label={`Steer queued prompt ${index + 1} into the current response`}
                        onClick={() => args.onSteer?.(item.id)}
                      >
                        <Zap className="size-3.5" />
                      </Button>
                    ) : null}
                    {args.canSendQueuedTurnNow ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-primary"
                        aria-label={`Send queued prompt ${index + 1} now`}
                        onClick={() => args.onSend?.(item.id)}
                      >
                        <Send className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit queued prompt ${index + 1}`}
                      onClick={() => args.onStartEdit(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete queued prompt ${index + 1}`}
                      onClick={() => args.onRemove?.(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
