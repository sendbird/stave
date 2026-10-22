import { i18n, useTranslation, type I18nKey } from "@/i18n";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import { Tooltip } from "@/components/ads/components/Tooltip";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { describeQueuedTurnDispatch } from "@/components/ai-elements/prompt-input-queued-turn";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { ShortcutKeys } from "@/components/system/ShortcutKeys";
import { Textarea } from "@/components/ui";
import {
  SortableDropIndicator,
  useSortableListMonitor,
  useSortableRow,
} from "@/hooks/use-sortable-list";
import { resolveKeybindingPlatform } from "@/lib/keybindings/key-chord";
import { formatKeybindingDisplay } from "@/lib/keybindings/keybinding-settings";
import type { QueuePauseReason } from "@/store/task-work-pause";
import type { PromptDraftQueuedTurn } from "@/types/chat";
import {
  canSteerQueuedTurnItem,
  describeQueuedTurnAttachments,
  describeQueuedTurnDelivery,
  describeQueueLine,
  reorderQueuedTurns,
  stepQueuedTurnMove,
  summarizeQueuedTurnText,
  type QueuedTurnActions,
  type QueuedTurnDelivery,
  type QueuedTurnMove,
} from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";

export type { QueuedTurnMove } from "./composer-shelf.utils";

/** The keys that move a focused queue row, for `aria-keyshortcuts`. */
const QUEUE_MOVE_ARIA_KEYS = "Alt+ArrowUp Alt+ArrowDown";
/** The same keys in the keybinding grammar, drawn in the grip's tooltip. */
const QUEUE_MOVE_KEYS = ["alt+arrowup", "alt+arrowdown"] as const;

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
  /**
   * Called when a row's editor opens and closes (Save, Cancel, the item
   * leaving, or the shelf unmounting or moving to another task). The owner
   * holds that item out of automatic sending meanwhile. `listId` is the queue
   * the editor was opened in, so closing always releases the same hold.
   */
  onEditStart?: (itemId: string, listId: string) => void;
  onEditEnd?: (itemId: string, listId: string) => void;
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
 * drag a row by its grip, or press Alt+ArrowUp/ArrowDown on it, to change that
 * order. A queued message that will go to another model than the composer's
 * says so, on its row.
 */
export const ShelfQueue = memo(function ShelfQueue(props: ComposerShelfQueueProps) {
  useTranslation();
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  // An item that left the queue (sent by hand, removed) takes its editor with it.
  const openEditorId =
    editingId != null && props.items.some((item) => item.id === editingId)
      ? editingId
      : null;
  const { onEditStart, onEditEnd, listId: queueListId } = props;
  // Hold the edited item out of automatic sending for exactly as long as its
  // editor is open, including when the shelf unmounts mid-edit.
  useEffect(() => {
    if (!openEditorId) {
      return;
    }
    onEditStart?.(openEditorId, queueListId);
    return () => {
      onEditEnd?.(openEditorId, queueListId);
    };
  }, [onEditEnd, onEditStart, openEditorId, queueListId]);
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
  const editing = openEditorId != null;
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
          <Tooltip content={expanded ? i18n.t("composer:shelfQueue.title3") : i18n.t("composer:shelfQueue.title4")}>
            <Button
              variant="quiet"
              size="xs"
              iconOnly
              aria-label={expanded ? i18n.t("composer:shelfQueue.ariaLabel4") : i18n.t("composer:shelfQueue.ariaLabel5")}
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
          </Tooltip>
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
  const listRef = useRef<HTMLOListElement | null>(null);
  // The row a keyboard move just placed; its grip takes focus once the list
  // re-renders in the new order.
  const movedIdRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
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
  // Moving a row can take the focused control out of the document and back,
  // which drops focus; put it on the moved row's grip again.
  useLayoutEffect(() => {
    const movedId = movedIdRef.current;
    if (!movedId) {
      return;
    }
    movedIdRef.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-queued-turn-id="${CSS.escape(movedId)}"] [data-queue-grip]`,
      )
      ?.focus();
  }, [props.items]);
  // Only real queue entries can move; a legacy single item has nothing to swap with.
  const sortable = Boolean(onReorder) && props.items.length > 1 && props.editingId == null;
  const moveKeys = useMemo(
    () => (
      <ShortcutKeys
        {...formatKeybindingDisplay(QUEUE_MOVE_KEYS, resolveKeybindingPlatform())}
        placement="tooltip"
      />
    ),
    [],
  );
  const moveByKeyboard = (itemId: string, direction: -1 | 1) => {
    const move = stepQueuedTurnMove(props.items, itemId, direction);
    if (!move || !onReorder) {
      return;
    }
    const next = reorderQueuedTurns(props.items, move);
    const text = i18n.t("composer:shelfQueue.movedTo", {
      position: next.findIndex((item) => item.id === itemId) + 1,
      total: next.length,
    });
    onReorder(move);
    movedIdRef.current = itemId;
    // The same words twice in a row would not be read again; a trailing
    // no-break space makes the second one a change.
    setAnnouncement((current) => (current === text ? `${text} ` : text));
  };
  return (
    <>
      <ol
        ref={listRef}
        className={sx(styles.queueList)}
        aria-label={i18n.t("composer:shelfQueue.ariaLabel7")}
      >
        {props.items.map((item, index) => (
          <QueueItem
            key={item.id}
            {...props}
            item={item}
            index={index}
            sortable={sortable}
            moveKeys={moveKeys}
            onMove={moveByKeyboard}
          />
        ))}
      </ol>
      <VisuallyHidden aria-live="polite" role="status">
        {announcement}
      </VisuallyHidden>
    </>
  );
}

const DELIVERY_KEYS = {
  held: "composer:shelfQueue.deliveryHeld",
  "next-turn": "composer:shelfQueue.deliveryNextTurn",
  steerable: "composer:shelfQueue.deliverySteerable",
} as const satisfies Record<QueuedTurnDelivery, I18nKey>;

function QueueItem(
  props: QueueListProps & {
    item: PromptDraftQueuedTurn;
    index: number;
    sortable: boolean;
    /** The move keys, drawn in the grip's tooltip. */
    moveKeys: ReactNode;
    onMove: (itemId: string, direction: -1 | 1) => void;
  },
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
          <p className={sx(styles.itemDelivery)}>{i18n.t("composer:shelfQueue.deliveryHeld")}</p>
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
  const delivery = describeQueuedTurnDelivery({ editing: false, turnActive: props.isTurnActive, paused: Boolean(props.pause), canSteer: props.actions.canSteer, item });
  const position = index + 1;
  // Alt+ArrowUp/Down moves the row from its grip or any of its actions.
  const onRowKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (
      !props.sortable ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    props.onMove(item.id, event.key === "ArrowUp" ? -1 : 1);
  };
  return (
    <li
      ref={setRowElement}
      className={sx(styles.item, isDragging && styles.itemDragging)}
      data-queued-turn-id={item.id}
      onKeyDown={onRowKeyDown}
    >
      <span className={sx(styles.itemSlot)}>
        <span className={sx(styles.itemIndex)}>{position}</span>
        {props.sortable ? (
          // The drag handle, and the row's keyboard handle: focus it and
          // press Alt+ArrowUp/Down to move the message.
          <Tooltip content={i18n.t("composer:shelfQueue.title6")} shortcut={props.moveKeys}>
            <Button
              ref={setHandleElement}
              variant="quiet"
              size="xs"
              iconOnly
              press="none"
              data-queue-grip=""
              aria-label={i18n.t("composer:shelfQueue.moveQueued", {
                position,
                total: props.items.length,
              })}
              aria-keyshortcuts={QUEUE_MOVE_ARIA_KEYS}
              xstyle={styles.itemGrip}
            >
              <GripVertical aria-hidden className={sx(styles.itemGripIcon)} />
            </Button>
          </Tooltip>
        ) : null}
      </span>
      <div className={sx(styles.itemBody)}>
        <p className={sx(styles.itemText)} title={summary}>
          {summary}
        </p>
        {dispatch.mismatchesComposer ? (
          <p className={sx(styles.itemCaution)}>{dispatch.caption}</p>
        ) : null}
        {delivery ? <p className={sx(styles.itemDelivery)}>{i18n.t(DELIVERY_KEYS[delivery])}</p> : null}
      </div>
      {attachments ? <span className={sx(styles.itemMeta)}>{attachments}</span> : null}
      <span className={sx(styles.itemActions)}>
        {props.actions.canSteer && canSteerQueuedTurnItem(item) ? (
          <Tooltip content={i18n.t("composer:shelfQueue.title7")}>
            <Button
              variant="quiet"
              size="xs"
              iconOnly
              aria-label={i18n.t("composer:shelfQueue.ariaLabel9", { value1: position })}
              onClick={() => props.onSteer(item.id)}
              xstyle={styles.itemAccent}
            >
              <Zap aria-hidden />
            </Button>
          </Tooltip>
        ) : null}
        {props.actions.canSend ? (
          <Tooltip content={i18n.t("composer:shelfQueue.title8")}>
            <Button
              variant="quiet"
              size="xs"
              iconOnly
              aria-label={i18n.t("composer:shelfQueue.ariaLabel10", { value1: position })}
              onClick={() => props.onSend(item.id)}
              xstyle={styles.itemAccent}
            >
              <Send aria-hidden />
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip content={i18n.t("composer:shelfQueue.title9")}>
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={i18n.t("composer:shelfQueue.ariaLabel11", { value1: position })}
            onClick={() => props.onStartEdit(item)}
            xstyle={styles.quiet}
          >
            <Pencil aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content={i18n.t("composer:shelfQueue.title10")}>
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={i18n.t("composer:shelfQueue.ariaLabel12", { value1: position })}
            onClick={() => props.onRemove(item.id)}
            xstyle={styles.itemDanger}
          >
            <Trash2 aria-hidden />
          </Button>
        </Tooltip>
      </span>
      {closestEdge ? <SortableDropIndicator edge={closestEdge} /> : null}
    </li>
  );
}
