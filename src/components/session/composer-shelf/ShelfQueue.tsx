import { i18n, useTranslation } from "@/i18n";
import { memo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  Pencil,
  Play,
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
import type { QueuePauseReason } from "@/store/task-work-pause";
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
  /** Why the queue is holding instead of sending on its own; null while it drains. */
  pause?: QueuePauseReason | null;
  /** Release a paused queue and send it in order. */
  onResume?: () => void;
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
  useTranslation();
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const line = describeQueueLine({
    items: props.items,
    actions: props.actions,
    isTurnActive: props.isTurnActive,
    pause: props.pause,
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
      <div className={sx(styles.line)} role="group" aria-label={i18n.t("composer:shelfQueue.ariaLabel")}>
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
          {line.pausedLabel ? (
            <span className={sx(styles.caution)}>{` · ${line.pausedLabel}`}</span>
          ) : null}
          {expanded ? null : (
            <>
              <span>{` · ${line.preview}`}</span>
              {frontDispatch.mismatchesComposer && frontDispatch.targetLabel ? (
                <span className={sx(styles.caution)}>{i18n.t("composer:shelfQueue.shelfQueue", { value1: frontDispatch.targetLabel })}</span>
              ) : null}
            </>
          )}
          {line.hint ? <span className={sx(styles.visuallyHidden)}>{` ${line.hint}`}</span> : null}
        </p>
        <span className={sx(styles.actions)}>
          {expanded ? (
            <>
              {line.frontAction === "resume" && props.onResume ? (
                <QueueResumeButton onResume={props.onResume} />
              ) : null}
              {props.onClearAll ? (
                <Button variant="quiet" size="xs" onClick={props.onClearAll} xstyle={styles.quiet}>
                  {i18n.t("composer:shelfQueue.shelfQueue2")}</Button>
              ) : null}
            </>
          ) : line.frontAction === "resume" && props.onResume ? (
            <QueueResumeButton onResume={props.onResume} />
          ) : line.frontAction === "steer" ? (
            <Button
              variant="quiet"
              size="xs"
              aria-label={i18n.t("composer:shelfQueue.ariaLabel2")}
              title={i18n.t("composer:shelfQueue.title")}
              onClick={() => props.onSteer(front.id)}
              xstyle={styles.itemAccent}
            >
              <Zap aria-hidden />
              <span className={sx(styles.actionWord)}>{i18n.t("composer:shelfQueue.shelfQueue3")}</span>
            </Button>
          ) : line.frontAction === "send" ? (
            <Button
              variant="quiet"
              size="xs"
              aria-label={i18n.t("composer:shelfQueue.ariaLabel3")}
              title={i18n.t("composer:shelfQueue.title2")}
              onClick={() => props.onSend(front.id)}
              xstyle={styles.itemAccent}
            >
              <Send aria-hidden />
              <span className={sx(styles.actionWord)}>{i18n.t("composer:shelfQueue.shelfQueue4")}</span>
            </Button>
          ) : null}
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={expanded ? i18n.t("composer:shelfQueue.ariaLabel4") : i18n.t("composer:shelfQueue.ariaLabel5")}
            title={expanded ? i18n.t("composer:shelfQueue.title3") : i18n.t("composer:shelfQueue.title4")}
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

function QueueResumeButton(props: { onResume: () => void }) {
  useTranslation();
  return (
    <Button
      variant="quiet"
      size="xs"
      aria-label={i18n.t("composer:shelfQueue.ariaLabel6")}
      title={i18n.t("composer:shelfQueue.title5")}
      onClick={props.onResume}
      xstyle={styles.itemAccent}
    >
      <Play aria-hidden />
      <span className={sx(styles.actionWord)}>{i18n.t("composer:shelfQueue.queueResumeButton")}</span>
    </Button>
  );
}

interface QueueListProps extends ComposerShelfQueueProps {
  editingId: string | null;
  editingContent: string;
  onEditingContentChange: (value: string) => void;
  onStartEdit: (item: PromptDraftQueuedTurn) => void;
  onCancelEdit: () => void;
  onSaveEdit: (itemId: string) => void;
}

function QueueList(props: QueueListProps) {
  useTranslation();
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
    <ol className={sx(styles.queueList)} aria-label={i18n.t("composer:shelfQueue.ariaLabel7")}>
      {props.items.map((item, index) => (
        <QueueItem key={item.id} {...props} item={item} index={index} sortable={sortable} />
      ))}
    </ol>
  );
}

function QueueItem(
  props: QueueListProps & { item: PromptDraftQueuedTurn; index: number; sortable: boolean },
) {
  useTranslation();
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
            aria-label={i18n.t("composer:shelfQueue.ariaLabel8", { value1: index + 1 })}
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
              {i18n.t("composer:shelfQueue.queueItem")}</Button>
            <Button variant="primary" size="xs" onClick={() => props.onSaveEdit(item.id)}>
              {i18n.t("composer:shelfQueue.queueItem2")}</Button>
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
          <span ref={setHandleElement} className={sx(styles.itemGrip)} title={i18n.t("composer:shelfQueue.title6")}>
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
            aria-label={i18n.t("composer:shelfQueue.ariaLabel9", { value1: position })}
            title={i18n.t("composer:shelfQueue.title7")}
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
            aria-label={i18n.t("composer:shelfQueue.ariaLabel10", { value1: position })}
            title={i18n.t("composer:shelfQueue.title8")}
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
          aria-label={i18n.t("composer:shelfQueue.ariaLabel11", { value1: position })}
          title={i18n.t("composer:shelfQueue.title9")}
          onClick={() => props.onStartEdit(item)}
          xstyle={styles.quiet}
        >
          <Pencil aria-hidden />
        </Button>
        <Button
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={i18n.t("composer:shelfQueue.ariaLabel12", { value1: position })}
          title={i18n.t("composer:shelfQueue.title10")}
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
