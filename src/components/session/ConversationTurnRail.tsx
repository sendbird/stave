import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ModelIcon } from "@/components/ai-elements";
import { UI_ELEVATION_CLASS, UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cx, sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { ConversationTurnActions } from "./ConversationTurnActions";
import { conversationTurnRailStyles as styles } from "./conversation-turn-rail.styles";
import {
  getConversationRailTickScale,
  type ConversationTurnRailItem,
} from "./conversation-turn-rail.utils";

interface ConversationTurnRailProps {
  taskId: string;
  items: ConversationTurnRailItem[];
  hasEarlierMessages?: boolean;
  onNavigate: (item: ConversationTurnRailItem) => void;
}

export interface ConversationTurnRailHandle {
  setActiveMessageId: (messageId: string) => void;
}

export const ConversationTurnRail = forwardRef<
  ConversationTurnRailHandle,
  ConversationTurnRailProps
>(function ConversationTurnRail(props, forwardedRef) {
  const uid = useId();
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLElement>());
  const suppressNextFocusPreviewRef = useRef(false);
  const [railHovered, setRailHovered] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [lastPreviewMessageId, setLastPreviewMessageId] = useState<
    string | null
  >(null);
  const [rovingMessageId, setRovingMessageId] = useState<string | null>(
    props.items.at(-1)?.messageId ?? null,
  );
  const [activeMessageId, setActiveMessageId] = useState<string | undefined>(
    () => props.items.at(-1)?.messageId,
  );
  const [previewTop, setPreviewTop] = useState<number | null>(null);

  const itemByMessageId = useMemo(
    () => new Map(props.items.map((item) => [item.messageId, item] as const)),
    [props.items],
  );
  const displayedMessageId =
    hoveredMessageId ?? focusedMessageId ?? pinnedMessageId;
  const displayedItem = displayedMessageId
    ? itemByMessageId.get(displayedMessageId)
    : undefined;
  const renderedItem =
    displayedItem ??
    (lastPreviewMessageId
      ? itemByMessageId.get(lastPreviewMessageId)
      : undefined);
  const displayedIndex = displayedMessageId
    ? props.items.findIndex((item) => item.messageId === displayedMessageId)
    : -1;
  const surfaceVisible = railHovered || Boolean(displayedMessageId);

  useImperativeHandle(forwardedRef, () => ({ setActiveMessageId }), []);

  const updatePreviewPosition = useCallback(() => {
    if (!displayedMessageId) {
      return;
    }
    const root = rootRef.current;
    const trigger = triggerRefs.current.get(displayedMessageId);
    if (!root || !trigger) {
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const cardHeight = previewRef.current?.getBoundingClientRect().height ?? 0;
    const desiredTop = triggerRect.top + triggerRect.height / 2 - rootRect.top;
    const halfCardHeight = Math.min(cardHeight / 2, rootRect.height / 2);
    const minimumTop = halfCardHeight + 4;
    const maximumTop = Math.max(
      minimumTop,
      rootRect.height - halfCardHeight - 4,
    );
    const nextTop = Math.min(maximumTop, Math.max(minimumTop, desiredTop));
    setPreviewTop((current) =>
      current !== null && Math.abs(current - nextTop) < 0.5 ? current : nextTop,
    );
  }, [displayedMessageId]);

  useEffect(() => {
    if (!displayedMessageId) {
      return;
    }
    setLastPreviewMessageId(displayedMessageId);
    updatePreviewPosition();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updatePreviewPosition);
    if (rootRef.current) {
      observer.observe(rootRef.current);
    }
    if (previewRef.current) {
      observer.observe(previewRef.current);
    }
    return () => observer.disconnect();
  }, [displayedMessageId, updatePreviewPosition]);

  useEffect(() => {
    setActiveMessageId((current) =>
      current && itemByMessageId.has(current)
        ? current
        : props.items.at(-1)?.messageId,
    );
    const currentRovingIsValid =
      rovingMessageId && itemByMessageId.has(rovingMessageId);
    if (currentRovingIsValid) {
      return;
    }
    setRovingMessageId(
      activeMessageId ?? props.items.at(-1)?.messageId ?? null,
    );
  }, [activeMessageId, itemByMessageId, props.items, rovingMessageId]);

  useEffect(() => {
    const root = rootRef.current;
    if (root?.contains(document.activeElement)) {
      return;
    }
    const nextRovingMessageId =
      activeMessageId ?? props.items.at(-1)?.messageId ?? null;
    setRovingMessageId(nextRovingMessageId);

    const viewport = viewportRef.current;
    const trigger = nextRovingMessageId
      ? triggerRefs.current.get(nextRovingMessageId)
      : undefined;
    if (!viewport || !trigger) {
      return;
    }
    const triggerTop = trigger.offsetTop;
    const triggerBottom = triggerTop + trigger.offsetHeight;
    if (triggerTop < viewport.scrollTop) {
      viewport.scrollTop = triggerTop;
    } else if (triggerBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = triggerBottom - viewport.clientHeight;
    }
  }, [activeMessageId, props.items]);

  useEffect(() => {
    if (!displayedMessageId) {
      return;
    }
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (actionDialogOpen) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }
      setHoveredMessageId(null);
      setFocusedMessageId(null);
      setPinnedMessageId(null);
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        rootRef.current?.contains(activeElement)
      ) {
        activeElement.blur();
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
    };
  }, [actionDialogOpen, displayedMessageId]);

  if (props.items.length < 2) {
    return null;
  }

  function focusItem(index: number) {
    const item = props.items[index];
    if (!item) {
      return;
    }
    setRovingMessageId(item.messageId);
    setFocusedMessageId(item.messageId);
    triggerRefs.current.get(item.messageId)?.focus();
  }

  function handleTriggerKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % props.items.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + props.items.length) % props.items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = props.items.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    focusItem(nextIndex);
  }

  function closePreviewAndRestoreFocus() {
    const trigger = displayedMessageId
      ? triggerRefs.current.get(displayedMessageId)
      : undefined;
    setHoveredMessageId(null);
    setFocusedMessageId(null);
    setPinnedMessageId(null);
    if (trigger && document.activeElement !== trigger) {
      suppressNextFocusPreviewRef.current = true;
      window.requestAnimationFrame(() => trigger.focus());
    }
  }

  const previewId = `conversation-turn-preview-${uid}`;

  return (
    <aside
      ref={rootRef}
      data-testid="conversation-turn-rail"
      aria-label="Conversation turn navigator"
      className={cx(
        // The rail floats over the conversation, so only its own affordances
        // (tick hit strips and the open preview) may capture pointer events.
        // Everything else stays transparent to clicks, drags, and wheel.
        UI_LAYER_CLASS.sessionFloater,
        sx(styles.root),
      )}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") {
          setRailHovered(true);
        }
      }}
      onPointerLeave={() => {
        setRailHovered(false);
        setHoveredMessageId(null);
      }}
      onBlur={(event) => {
        const nextFocused = event.relatedTarget;
        if (
          !actionDialogOpen &&
          (!(nextFocused instanceof Node) ||
            !event.currentTarget.contains(nextFocused))
        ) {
          setFocusedMessageId(null);
        }
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && displayedMessageId) {
          event.preventDefault();
          event.stopPropagation();
          closePreviewAndRestoreFocus();
        }
      }}
    >
      <div
        ref={viewportRef}
        role="toolbar"
        aria-label="Conversation turns"
        aria-orientation="vertical"
        data-surface={surfaceVisible ? "visible" : "hidden"}
        className={sx(
          styles.viewport,
          surfaceVisible ? styles.viewportVisible : styles.viewportHidden,
        )}
        onScroll={updatePreviewPosition}
      >
        <div className={sx(styles.tickColumn)}>
          {props.items.map((item, index) => {
            const active = item.messageId === activeMessageId;
            const displayed = item.messageId === displayedMessageId;
            const scale = getConversationRailTickScale({
              index,
              displayedIndex,
              active,
            });
            const triggerId = `conversation-turn-trigger-${uid}-${index}`;
            const positionLabel = props.hasEarlierMessages
              ? `Loaded turn ${index + 1} of ${props.items.length}`
              : `Turn ${index + 1} of ${props.items.length}`;
            return (
              <AdsButton
                layout="host"
                key={item.messageId}
                ref={(node) => {
                  if (node) {
                    triggerRefs.current.set(item.messageId, node);
                  } else {
                    triggerRefs.current.delete(item.messageId);
                  }
                }}
                id={triggerId}
                type="button"
                tabIndex={rovingMessageId === item.messageId ? 0 : -1}
                aria-label={`${positionLabel}: ${item.promptPreview}. ${item.responsePreview}`}
                aria-current={active ? "step" : undefined}
                aria-expanded={displayed}
                aria-controls={displayed ? previewId : undefined}
                data-turn-rail-message-id={item.messageId}
                data-active={active ? "true" : undefined}
                className={sx(
                  styles.trigger,
                  focusRing.ring,
                  focusRing.ringInset,
                )}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") {
                    setHoveredMessageId(item.messageId);
                  }
                }}
                onFocus={() => {
                  setRovingMessageId(item.messageId);
                  if (suppressNextFocusPreviewRef.current) {
                    suppressNextFocusPreviewRef.current = false;
                    return;
                  }
                  setFocusedMessageId(item.messageId);
                }}
                onClick={() => {
                  setActiveMessageId(item.messageId);
                  setPinnedMessageId((current) =>
                    current === item.messageId ? null : item.messageId,
                  );
                  props.onNavigate(item);
                }}
                onKeyDown={(event) => handleTriggerKeyDown(event, index)}
              >
                <span
                  aria-hidden="true"
                  className={sx(
                    styles.tick,
                    displayed && styles.tickDisplayed,
                    active && !displayed && styles.tickActive,
                  )}
                  style={{ transform: `scaleX(${scale})` }}
                />
              </AdsButton>
            );
          })}
        </div>
      </div>

      <section
        ref={previewRef}
        id={previewId}
        data-testid="conversation-turn-preview"
        role="group"
        aria-labelledby={`${previewId}-title`}
        aria-hidden={!displayedItem}
        inert={!displayedItem}
        data-state={displayedItem ? "open" : "closed"}
        className={cx(
          UI_ELEVATION_CLASS.floating,
          sx(
            styles.preview,
            displayedItem ? styles.previewOpen : styles.previewClosed,
          ),
        )}
        style={{ top: previewTop ?? "50%" }}
      >
        {renderedItem ? (
          <div key={renderedItem.messageId} className={sx(styles.previewBody)}>
            <div className={sx(styles.previewMeta)}>
              <ModelIcon
                providerId={renderedItem.providerId}
                className={sx(styles.previewMetaIcon)}
              />
              <span>
                {props.hasEarlierMessages ? "Loaded turn" : "Turn"}{" "}
                {props.items.indexOf(renderedItem) + 1} of {props.items.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className={sx(styles.previewMetaModel)}>
                {renderedItem.model}
              </span>
            </div>
            <div className={sx(styles.previewText)}>
              <h3 id={`${previewId}-title`} className={sx(styles.previewTitle)}>
                {renderedItem.promptPreview}
              </h3>
              <p className={sx(styles.previewResponse)}>
                {renderedItem.responsePreview}
              </p>
            </div>
            <ConversationTurnActions
              key={renderedItem.messageId}
              taskId={props.taskId}
              messageId={renderedItem.messageId}
              state={renderedItem.state}
              variant="preview"
              onRollbackDialogOpenChange={(open) => {
                setActionDialogOpen(open);
                if (open) {
                  setPinnedMessageId(renderedItem.messageId);
                }
              }}
            />
            <p className={sx(styles.previewHint)}>
              Select a tick to jump to that response. Workspace files stay
              unchanged.
            </p>
          </div>
        ) : null}
      </section>
    </aside>
  );
});
