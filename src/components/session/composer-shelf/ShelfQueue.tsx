import { memo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  Pencil,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { describeQueuedTurnDispatch } from "@/components/ai-elements/prompt-input-queued-turn";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { Textarea } from "@/components/ui";
import {
  SortableDropIndicator,
  useSortableListMonitor,
  useSortableRow,
} from "@/hooks/use-sortable-list";
import type { PromptDraftQueuedTurn } from "@/types/chat";
import {
  canSteerQueuedTurnItem,
  describeQueuedTurnAttachments,
  describeQueueLine,
  summarizeQueuedTurnText,
  type QueuedTurnActions,
} from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";

export interface QueuedTurnMove {
  sourceId: string;
  targetId: string;
  edge: "top" | "bottom" | null;
}

export interface ComposerShelfQueueProps {
  /** Rows only accept drops from their own list. */
  listId: string;
  items: readonly PromptDraftQueuedTurn[];
  actions: QueuedTurnActions;
  isTurnActive: boolean;
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  onSteer: (itemId: string) => void;
  onSend: (itemId: string) => void;
  onUpdate: (args: { itemId: string; content: string }) => void;
  onRemove: (itemId: string) => void;
  onClearAll?: () => void;
  onReorder?: (move: QueuedTurnMove) => void;
  /** Start with the list open (previews and tests); the queue starts folded in the app. */
  defaultOpen?: boolean;
}

/**
 * The queue's line in the composer shelf: how many wait, the one that goes
 * next, and its Steer (or Send, when nothing runs). The chevron opens the list
 * with Steer, Send, Edit and Delete on each row, in the order they will send;
 * drag a row by its grip to change that order. A queued message that will go
 * to another model than the composer's says so, on its row.
 */
export const ShelfQueue = memo(function ShelfQueue(props: ComposerShelfQueueProps) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const line = describeQueueLine({
    items: props.items,
    actions: props.actions,
    isTurnActive: props.isTurnActive,
  });
  const front = props.items[0];
  if (!line || !front) {
    return null;
  }
  const frontDispatch = describeQueuedTurnDispatch({
    queuedTurn: front,
    selection: props.selectedModel,
    modelOptions: props.modelOptions,
  });
  // An item dispatched while it was being edited takes its editor with it.
  const editing = editingId != null && props.items.some((item) => item.id === editingId);
  const expanded = open || editing;
  const listId = `composer-shelf-queue-${props.listId}`;
  return (
    <div data-testid="composer-shelf-queue">
      <div className={sx(styles.line)} role="group" aria-label="Queued messages">
        <span className={sx(styles.mark)}>
          <CornerDownRight aria-hidden className={sx(styles.queueIcon)} />
        </span>
        <p
          className={sx(styles.text)}
          title={[line.preview, frontDispatch.mismatchesComposer ? frontDispatch.caption : null, line.hint]
            .filter(Boolean)
            .join("\n")}
        >
          <span className={sx(styles.label)}>{line.countLabel}</span>
          {expanded ? null : (
            <>
              <span>{` · ${line.preview}`}</span>
              {frontDispatch.mismatchesComposer && frontDispatch.targetLabel ? (
                <span className={sx(styles.caution)}>{` · as ${frontDispatch.targetLabel}`}</span>
              ) : null}
            </>
          )}
          {line.hint ? <span className={sx(styles.visuallyHidden)}>{` ${line.hint}`}</span> : null}
        </p>
        <span className={sx(styles.actions)}>
          {expanded ? (
            props.onClearAll ? (
              <Button variant="quiet" size="xs" onClick={props.onClearAll} xstyle={styles.quiet}>
                Clear all
              </Button>
            ) : null
          ) : line.frontAction === "steer" ? (
            <Button
              variant="quiet"
              size="xs"
              aria-label="Steer queued prompt 1 into the current response"
              title="Steer it into the current response"
              onClick={() => props.onSteer(front.id)}
              xstyle={styles.itemAccent}
            >
              <Zap aria-hidden />
              <span className={sx(styles.actionWord)}>Steer</span>
            </Button>
          ) : line.frontAction === "send" ? (
            <Button
              variant="quiet"
              size="xs"
              aria-label="Send queued prompt 1 now"
              title="Send it now"
              onClick={() => props.onSend(front.id)}
              xstyle={styles.itemAccent}
            >
              <Send aria-hidden />
              <span className={sx(styles.actionWord)}>Send</span>
            </Button>
          ) : null}
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={expanded ? "Hide queued messages" : "Show queued messages"}
            title={expanded ? "Hide queued messages" : "Show queued messages"}
            aria-expanded={expanded}
            onClick={() => {
              if (expanded) {
                setEditingId(null);
              }
              setOpen(!expanded);
            }}
            xstyle={styles.quiet}
          >
            {expanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
          </Button>
        </span>
      </div>
      {expanded ? (
        <QueueList
          {...props}
          listId={listId}
          editingId={editing ? editingId : null}
          editingContent={editingContent}
          onEditingContentChange={setEditingContent}
          onStartEdit={(item) => {
            setEditingId(item.id);
            setEditingContent(item.content);
          }}
          onCancelEdit={() => {
            setEditingId(null);
            setEditingContent("");
          }}
          onSaveEdit={(itemId) => {
            props.onUpdate({ itemId, content: editingContent.trim() });
            setEditingId(null);
            setEditingContent("");
          }}
        />
      ) : null}
    </div>
  );
});

interface QueueListProps extends ComposerShelfQueueProps {
  editingId: string | null;
  editingContent: string;
  onEditingContentChange: (value: string) => void;
  onStartEdit: (item: PromptDraftQueuedTurn) => void;
  onCancelEdit: () => void;
  onSaveEdit: (itemId: string) => void;
}

function QueueList(props: QueueListProps) {
  const { onReorder, listId } = props;
  useSortableListMonitor({
    isListMatch: (candidate) => candidate === listId,
    onReorder: (event) =>
      onReorder?.({
        sourceId: event.sourceId,
        targetId: event.targetId,
        edge:
          event.closestEdge === "bottom"
            ? "bottom"
            : event.closestEdge === "top"
              ? "top"
              : null,
      }),
  });
  // Only real queue entries can move; a legacy single item has nothing to swap with.
  const sortable = Boolean(onReorder) && props.items.length > 1 && props.editingId == null;
  return (
    <ol className={sx(styles.queueList)} aria-label="Queued messages, in the order they send">
      {props.items.map((item, index) => (
        <QueueItem key={item.id} {...props} item={item} index={index} sortable={sortable} />
      ))}
    </ol>
  );
}

function QueueItem(
  props: QueueListProps & { item: PromptDraftQueuedTurn; index: number; sortable: boolean },
) {
  const { item, index } = props;
  const summary = summarizeQueuedTurnText(item);
  const { setRowElement, setHandleElement, isDragging, closestEdge } = useSortableRow({
    listId: props.listId,
    itemId: item.id,
    disabled: !props.sortable,
    preview: { title: summary, icon: <CornerDownRight aria-hidden /> },
  });
  const isEditing = props.editingId === item.id;
  if (isEditing) {
    return (
      <li className={sx(styles.item, styles.itemEditing)}>
        <span className={sx(styles.itemSlot)}>
          <span className={sx(styles.itemIndex)}>{index + 1}</span>
        </span>
        <div className={sx(styles.editArea)}>
          <Textarea
            value={props.editingContent}
            aria-label={`Edit queued prompt ${index + 1}`}
            autoFocus
            onChange={(event) => props.onEditingContentChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                props.onCancelEdit();
                return;
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                event.preventDefault();
                props.onSaveEdit(item.id);
              }
            }}
            xstyle={styles.editTextarea}
          />
          <div className={sx(styles.editActions)}>
            <Button variant="quiet" size="xs" onClick={props.onCancelEdit}>
              Cancel
            </Button>
            <Button variant="primary" size="xs" onClick={() => props.onSaveEdit(item.id)}>
              Save
            </Button>
          </div>
        </div>
      </li>
    );
  }
  const dispatch = describeQueuedTurnDispatch({
    queuedTurn: item,
    selection: props.selectedModel,
    modelOptions: props.modelOptions,
  });
  const attachments = describeQueuedTurnAttachments(item);
  const position = index + 1;
  return (
    <li
      ref={setRowElement}
      className={sx(styles.item, isDragging && styles.itemDragging)}
      data-queued-turn-id={item.id}
    >
      <span className={sx(styles.itemSlot)}>
        <span className={sx(styles.itemIndex)}>{position}</span>
        {props.sortable ? (
          <span ref={setHandleElement} className={sx(styles.itemGrip)} title="Drag to reorder">
            <GripVertical aria-hidden className={sx(styles.itemGripIcon)} />
          </span>
        ) : null}
      </span>
      <div className={sx(styles.itemBody)}>
        <p className={sx(styles.itemText)} title={summary}>
          {summary}
        </p>
        {dispatch.mismatchesComposer ? (
          <p className={sx(styles.itemCaution)}>{dispatch.caption}</p>
        ) : null}
      </div>
      {attachments ? <span className={sx(styles.itemMeta)}>{attachments}</span> : null}
      <span className={sx(styles.itemActions)}>
        {props.actions.canSteer && canSteerQueuedTurnItem(item) ? (
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={`Steer queued prompt ${position} into the current response`}
            title="Steer into the current response"
            onClick={() => props.onSteer(item.id)}
            xstyle={styles.itemAccent}
          >
            <Zap aria-hidden />
          </Button>
        ) : null}
        {props.actions.canSend ? (
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={`Send queued prompt ${position} now`}
            title="Send now"
            onClick={() => props.onSend(item.id)}
            xstyle={styles.itemAccent}
          >
            <Send aria-hidden />
          </Button>
        ) : null}
        <Button
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={`Edit queued prompt ${position}`}
          title="Edit"
          onClick={() => props.onStartEdit(item)}
          xstyle={styles.quiet}
        >
          <Pencil aria-hidden />
        </Button>
        <Button
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={`Delete queued prompt ${position}`}
          title="Delete"
          onClick={() => props.onRemove(item.id)}
          xstyle={styles.itemDanger}
        >
          <Trash2 aria-hidden />
        </Button>
      </span>
      {closestEdge ? <SortableDropIndicator edge={closestEdge} /> : null}
    </li>
  );
}
