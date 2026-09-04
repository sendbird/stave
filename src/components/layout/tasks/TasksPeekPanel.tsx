import { ChevronDown, ChevronUp, Maximize2, X } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui";
import {
  clampTrackerTasksPeekWidth,
  TRACKER_TASKS_PEEK_KEYBOARD_STEP_PX,
  TRACKER_TASKS_PEEK_MAX_PX,
  TRACKER_TASKS_PEEK_MIN_PX,
} from "@/lib/tracker-tasks/peek-size";
import { cn } from "@/lib/utils";

export type TasksPeekDock = "split" | "parent";

export interface TasksPeekPanelProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  onNavigate?: (direction: "prev" | "next") => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onExpand?: () => void;
  headerActions?: ReactNode;
  /** `split` narrows the list; `parent` overlays it on a starved frame. */
  dock?: TasksPeekDock;
  width: number;
  onWidthChange: (width: number) => void;
}

/**
 * Ticket peek following the ADS PeekPanel contract, painted with Stave tokens.
 *
 * StyleX ADS source is not installed in this host. The behavior is the
 * documented one: no focus trap, Escape-in-panel close, prev/next, and
 * `dock="split"` taking an in-flow track so the list stays readable. The first
 * open is wider than ADS's 420px split default; the leading rail persists the
 * reader's width.
 */
export function TasksPeekPanel(props: TasksPeekPanelProps) {
  const {
    closeLabel = "Close",
    dock = "split",
    nextDisabled = false,
    prevDisabled = false,
    width,
  } = props;
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (props.open) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        const active = document.activeElement;
        openerRef.current =
          active instanceof HTMLElement && active !== document.body
            ? active
            : null;
      }
      return;
    }
    if (!wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = false;
    const opener = openerRef.current;
    openerRef.current = null;
    const active = document.activeElement;
    const panel = document.getElementById(titleId)?.closest("aside");
    const focusWasInsidePanel =
      active instanceof HTMLElement && Boolean(panel?.contains(active));
    if (active && active !== document.body && !focusWasInsidePanel) {
      return;
    }
    if (opener?.isConnected) {
      opener.focus();
    }
  }, [props.open, titleId]);

  const commitWidth = (next: number) => {
    props.onWidthChange(clampTrackerTasksPeekWidth(next));
  };

  const onResizePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
  };

  const onResizePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    commitWidth(drag.startWidth + (drag.startX - event.clientX));
  };

  const onResizePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current === null) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitWidth(width + TRACKER_TASKS_PEEK_KEYBOARD_STEP_PX);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      commitWidth(width - TRACKER_TASKS_PEEK_KEYBOARD_STEP_PX);
    }
  };

  const split = dock === "split";
  const clampedWidth = clampTrackerTasksPeekWidth(width);
  const rootStyle = {
    "--stave-peek-width": `${clampedWidth}px`,
  } as CSSProperties;

  return (
    <aside
      aria-labelledby={titleId}
      data-open={props.open ? "true" : "false"}
      data-stave-peek-panel=""
      inert={!props.open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          props.onClose();
        }
      }}
      style={rootStyle}
      className={cn(
        "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground",
        "transition-[transform,opacity,visibility,margin] duration-200 ease-out motion-reduce:duration-0",
        split
          ? cn(
              "relative w-[var(--stave-peek-width)] shrink-0 border-l border-border",
              props.open
                ? "me-0 translate-x-0"
                : "pointer-events-none invisible me-[calc(-1*var(--stave-peek-width))] translate-x-full opacity-0",
            )
          : cn(
              "absolute inset-y-0 right-0 z-20 w-[min(var(--stave-peek-width),100%)] border-l border-border shadow-md",
              props.open
                ? "translate-x-0"
                : "pointer-events-none invisible translate-x-[110%] opacity-0",
            ),
        "max-md:absolute max-md:inset-0 max-md:z-20 max-md:w-full max-md:border-l-0 max-md:shadow-none",
        props.open
          ? "max-md:translate-x-0"
          : "max-md:invisible max-md:translate-x-full max-md:opacity-0",
      )}
    >
      {props.open ? (
        <button
          type="button"
          aria-label="Resize ticket peek"
          aria-orientation="vertical"
          aria-valuemin={TRACKER_TASKS_PEEK_MIN_PX}
          aria-valuemax={TRACKER_TASKS_PEEK_MAX_PX}
          aria-valuenow={clampedWidth}
          role="separator"
          className={cn(
            "absolute inset-y-0 left-0 z-10 w-3 -translate-x-1/2 cursor-col-resize",
            "max-md:hidden",
            "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent",
            "hover:before:bg-primary/50 focus-visible:before:bg-primary",
            "focus-visible:outline-none",
          )}
          onKeyDown={onResizeKeyDown}
          onPointerCancel={onResizePointerUp}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      ) : null}

      <header className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        {props.onNavigate ? (
          <div className="flex shrink-0 flex-col">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Previous ticket"
              disabled={prevDisabled}
              onClick={() => props.onNavigate?.("prev")}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Next ticket"
              disabled={nextDisabled}
              onClick={() => props.onNavigate?.("next")}
            >
              <ChevronDown aria-hidden />
            </Button>
          </div>
        ) : null}
        <h2
          id={titleId}
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={typeof props.title === "string" ? props.title : undefined}
        >
          {props.title}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          {props.headerActions}
          {props.onExpand ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Open in browser"
              onClick={props.onExpand}
            >
              <Maximize2 aria-hidden className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={closeLabel}
            onClick={props.onClose}
          >
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 overflow-hidden">{props.children}</div>
    </aside>
  );
}
