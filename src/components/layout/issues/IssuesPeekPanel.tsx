import { i18n, useTranslation } from "@/i18n";
import { trackerVisualStyles } from "./tracker-visual.styles";
import { Button as AdsButton } from "@/components/ads/components/Button";
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
  clampTrackerIssuesPeekWidth,
  TRACKER_ISSUES_PEEK_KEYBOARD_STEP_PX,
  TRACKER_ISSUES_PEEK_MAX_PX,
  TRACKER_ISSUES_PEEK_MIN_PX,
} from "@/lib/tracker-issues/peek-size";
import { sx } from "@/components/ads/utils/stylex";
import { taskLayoutStyles } from "./issues-layout.stylex";

export type IssuesPeekDock = "split" | "parent";

export interface IssuesPeekPanelProps {
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
  dock?: IssuesPeekDock;
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
export function IssuesPeekPanel(props: IssuesPeekPanelProps) {
  const { t: tI18n } = useTranslation(["issues"]);
  const {
    closeLabel = tI18n("issues:issuesPeekPanel.close"),
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
    props.onWidthChange(clampTrackerIssuesPeekWidth(next));
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
      commitWidth(width + TRACKER_ISSUES_PEEK_KEYBOARD_STEP_PX);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      commitWidth(width - TRACKER_ISSUES_PEEK_KEYBOARD_STEP_PX);
    }
  };

  const split = dock === "split";
  const clampedWidth = clampTrackerIssuesPeekWidth(width);
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
      className={sx(
        taskLayoutStyles.peek,
        split ? taskLayoutStyles.peekSplit : taskLayoutStyles.peekParent,
        props.open
          ? taskLayoutStyles.peekOpen
          : split
            ? taskLayoutStyles.peekClosedSplit
            : taskLayoutStyles.peekClosedParent,
      )}
    >
      {props.open ? (
        <AdsButton
          layout="host"
          type="button"
          aria-label={tI18n("issues:issuesPeekPanel.resizeTicketPeek")}
          aria-orientation="vertical"
          aria-valuemin={TRACKER_ISSUES_PEEK_MIN_PX}
          aria-valuemax={TRACKER_ISSUES_PEEK_MAX_PX}
          aria-valuenow={clampedWidth}
          role="separator"
          xstyle={taskLayoutStyles.peekResize}
          onKeyDown={onResizeKeyDown}
          onPointerCancel={onResizePointerUp}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      ) : null}

      <header className={sx(taskLayoutStyles.peekHeader)}>
        {props.onNavigate ? (
          <div className={sx(taskLayoutStyles.peekNavigation)}>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={tI18n("issues:issuesPeekPanel.previousTicket")}
              disabled={prevDisabled}
              onClick={() => props.onNavigate?.("prev")}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={tI18n("issues:issuesPeekPanel.nextTicket")}
              disabled={nextDisabled}
              onClick={() => props.onNavigate?.("next")}
            >
              <ChevronDown aria-hidden />
            </Button>
          </div>
        ) : null}
        <h2
          id={titleId}
          className={sx(taskLayoutStyles.peekTitle)}
          title={typeof props.title === "string" ? props.title : undefined}
        >
          {props.title}
        </h2>
        <div className={sx(taskLayoutStyles.peekActions)}>
          {props.headerActions}
          {props.onExpand ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={tI18n("issues:issuesPeekPanel.openInBrowser")}
              onClick={props.onExpand}
            >
              <Maximize2 aria-hidden className={sx(trackerVisualStyles.icon)} />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={closeLabel}
            onClick={props.onClose}
          >
            <X aria-hidden className={sx(trackerVisualStyles.icon)} />
          </Button>
        </div>
      </header>
      <div className={sx(taskLayoutStyles.peekBody)}>{props.children}</div>
    </aside>
  );
}
