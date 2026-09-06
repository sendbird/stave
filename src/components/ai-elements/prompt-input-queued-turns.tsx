import { Pencil, Send, Trash2, Zap } from "lucide-react";
import { Badge, Button, Textarea } from "@/components/ui";
import { sx } from "../ads/utils/stylex";
import { queuedTurnsStyles } from "./prompt-input-queued-turns.styles";
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
    <div className={sx(queuedTurnsStyles.container)}>
      <div className={sx(queuedTurnsStyles.header)}>
        <Badge variant="secondary" className={sx(queuedTurnsStyles.badge)}>
          Queue
        </Badge>
        <span className={sx(queuedTurnsStyles.caption)}>
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
          <Badge variant="outline" className={sx(queuedTurnsStyles.badgeCount)}>
            {args.queuedFileCount}{" "}
            {args.queuedFileCount === 1 ? "file" : "files"}
          </Badge>
        ) : null}
        {args.queuedImageCount > 0 ? (
          <Badge variant="outline" className={sx(queuedTurnsStyles.badgeCount)}>
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
            className={sx(queuedTurnsStyles.clearButton)}
          >
            Clear all
          </Button>
        ) : null}
      </div>
      <div className={sx(queuedTurnsStyles.rows)}>
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
              className={sx(
                queuedTurnsStyles.row,
                index === 0 && !isEditing && queuedTurnsStyles.rowFirst,
              )}
            >
              {isEditing ? (
                <div className={sx(queuedTurnsStyles.editArea)}>
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
                    className={sx(queuedTurnsStyles.editTextarea)}
                  />
                  <div className={sx(queuedTurnsStyles.editActions)}>
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
                <div className={sx(queuedTurnsStyles.rowBody)}>
                  <span className={sx(queuedTurnsStyles.indexBadge)}>
                    {index + 1}
                  </span>
                  <div className={sx(queuedTurnsStyles.rowContent)}>
                    <p className={sx(queuedTurnsStyles.summary)}>
                      {summary}
                    </p>
                    <p
                      className={sx(
                        queuedTurnsStyles.dispatch,
                        dispatch.mismatchesComposer
                          ? queuedTurnsStyles.dispatchWarning
                          : index === 0
                            ? queuedTurnsStyles.dispatchFirst
                            : queuedTurnsStyles.dispatchMuted,
                      )}
                    >
                      {index === 0 ? "Next to send · " : ""}
                      {dispatch.caption}
                    </p>
                  </div>
                  <div className={sx(queuedTurnsStyles.actions)}>
                    {args.canSteerQueuedTurnNow &&
                    item.attachedFilePaths.length === 0 &&
                    item.attachments.length === 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={sx(queuedTurnsStyles.actionAccent)}
                        aria-label={`Steer queued prompt ${index + 1} into the current response`}
                        onClick={() => args.onSteer?.(item.id)}
                      >
                        <Zap className={sx(queuedTurnsStyles.actionIcon)} />
                      </Button>
                    ) : null}
                    {args.canSendQueuedTurnNow ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={sx(queuedTurnsStyles.actionAccent)}
                        aria-label={`Send queued prompt ${index + 1} now`}
                        onClick={() => args.onSend?.(item.id)}
                      >
                        <Send className={sx(queuedTurnsStyles.actionIcon)} />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit queued prompt ${index + 1}`}
                      onClick={() => args.onStartEdit(item)}
                    >
                      <Pencil className={sx(queuedTurnsStyles.actionIcon)} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={sx(queuedTurnsStyles.actionDanger)}
                      aria-label={`Delete queued prompt ${index + 1}`}
                      onClick={() => args.onRemove?.(item.id)}
                    >
                      <Trash2 className={sx(queuedTurnsStyles.actionIcon)} />
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
