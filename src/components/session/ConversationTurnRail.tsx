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
import { cn } from "@/lib/utils";
import { ConversationTurnActions } from "./ConversationTurnActions";
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
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
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
      className={cn(
        UI_LAYER_CLASS.sessionFloater,
        // The rail floats over the conversation, so only its own affordances
        // (tick hit strips and the open preview) may capture pointer events.
        // Everything else stays transparent to clicks, drags, and wheel.
        "pointer-events-none absolute right-2 top-1/2 h-[min(22.5rem,calc(100%-4rem))] min-h-40 w-12 -translate-y-1/2",
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
        className={cn(
          "h-full overflow-y-auto overscroll-contain rounded-full py-2 transition-[background-color,backdrop-filter] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          surfaceVisible
            ? "bg-background/60 backdrop-blur-md"
            : "bg-transparent backdrop-blur-none",
        )}
        onScroll={updatePreviewPosition}
      >
        <div className="flex min-h-full flex-col items-end justify-center">
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
              <button
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
                className="group/turn-tick pointer-events-auto flex h-6 w-8 shrink-0 items-center justify-end rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
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
                  className={cn(
                    "block h-px w-8 origin-right bg-current transition-[transform,color,opacity] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                    displayed && "text-foreground",
                    active && !displayed && "text-primary",
                    !active && !displayed && "opacity-70",
                  )}
                  style={{ transform: `scaleX(${scale})` }}
                />
              </button>
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
        className={cn(
          UI_ELEVATION_CLASS.floating,
          "absolute right-full mr-2 w-80 origin-right -translate-y-1/2 rounded-md border border-border/70 bg-popover p-3 text-popover-foreground ring-1 ring-foreground/10 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:scale-100",
          displayedItem
            ? "visible pointer-events-auto scale-100 opacity-100"
            : "invisible pointer-events-none scale-[0.97] opacity-0",
        )}
        style={{ top: previewTop ?? "50%" }}
      >
        {renderedItem ? (
          <div key={renderedItem.messageId} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ModelIcon
                providerId={renderedItem.providerId}
                className="size-3.5"
              />
              <span>
                {props.hasEarlierMessages ? "Loaded turn" : "Turn"}{" "}
                {props.items.indexOf(renderedItem) + 1} of {props.items.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{renderedItem.model}</span>
            </div>
            <div className="space-y-1">
              <h3
                id={`${previewId}-title`}
                className="line-clamp-2 text-sm font-medium leading-5"
              >
                {renderedItem.promptPreview}
              </h3>
              <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
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
            <p className="text-[11px] leading-4 text-muted-foreground/75">
              Select a tick to jump to that response. Workspace files stay
              unchanged.
            </p>
          </div>
        ) : null}
      </section>
    </aside>
  );
});
