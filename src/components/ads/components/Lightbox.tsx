import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import * as React from "react";

import {
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../headless/dialog";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Button } from "./Button";
import { VisuallyHidden } from "./VisuallyHidden";

export type LightboxMediaType = "image" | "video";

export type LightboxMedia = {
  /** Accessible alternative text and the lightbox title. */
  alt: string;
  caption?: React.ReactNode;
  /** Media source URL. */
  src: string;
  /** @default "image" */
  type?: LightboxMediaType;
};

export type LightboxProps = {
  className?: string;
  title?: string;
  closeLabel?: string;
  testId?: string;
  /** Enable image zoom controls, double-click zoom, and drag-to-pan. */
  hasZoom?: boolean;
  /** Controlled gallery index. Omit for internally managed navigation. */
  index?: number;
  /** One item, or a gallery with previous/next navigation. */
  media: LightboxMedia | readonly LightboxMedia[];
  /** Called when gallery navigation changes the active item. */
  onIndexChange?: (index: number) => void;
  /** Called when the overlay opens or closes. */
  onOpenChange: (open: boolean) => void;
  /** Controlled open state. */
  open: boolean;
};

type ViewState = { scale: number; x: number; y: number };

const DEFAULT_VIEW: ViewState = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Full-viewport media viewer for images and video. The Base UI Dialog layer
 * owns focus trapping, Escape/outside dismissal, scroll lock, and focus
 * restoration; Lightbox adds gallery navigation and optional image zoom/pan.
 */
export function Lightbox({
  className, title, closeLabel = "Close lightbox", testId,
  hasZoom = false,
  index,
  media,
  onIndexChange,
  onOpenChange,
  open,
}: LightboxProps) {
  const items: readonly LightboxMedia[] = Array.isArray(media)
    ? media
    : [media as LightboxMedia];
  const [internalIndex, setInternalIndex] = React.useState(0);
  const lastIndex = Math.max(0, items.length - 1);
  const activeIndex = clamp(index ?? internalIndex, 0, lastIndex);
  const current = items[activeIndex];
  const [view, setView] = React.useState<ViewState>(DEFAULT_VIEW);
  const [dragging, setDragging] = React.useState(false);
  const mediaRef = React.useRef<HTMLImageElement | null>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
  } | null>(null);

  const setActiveIndex = React.useCallback(
    (nextIndex: number) => {
      if (items.length === 0) return;
      const next = clamp(nextIndex, 0, items.length - 1);
      if (index === undefined) setInternalIndex(next);
      onIndexChange?.(next);
    },
    [index, items.length, onIndexChange],
  );

  React.useEffect(() => {
    setView(DEFAULT_VIEW);
    setDragging(false);
    dragRef.current = null;
  }, [activeIndex, open]);

  const clampPan = React.useCallback((x: number, y: number, scale: number) => {
    const element = mediaRef.current;
    if (!element || scale <= MIN_SCALE) return { x: 0, y: 0 };
    const maxX = (element.offsetWidth * (scale - 1)) / 2;
    const maxY = (element.offsetHeight * (scale - 1)) / 2;
    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  }, []);

  const setScale = React.useCallback(
    (nextScale: number) => {
      setView((currentView) => {
        const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
        const pan = clampPan(currentView.x, currentView.y, scale);
        return { scale, ...pan };
      });
    },
    [clampPan],
  );

  const resetView = React.useCallback(() => setView(DEFAULT_VIEW), []);
  const canZoom = hasZoom && current?.type !== "video";
  const gallery = items.length > 1;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLVideoElement) return;
    if (gallery && event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex(activeIndex - 1);
    } else if (gallery && event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex(activeIndex + 1);
    } else if (gallery && event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (gallery && event.key === "End") {
      event.preventDefault();
      setActiveIndex(lastIndex);
    } else if (canZoom && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      setScale(view.scale + SCALE_STEP);
    } else if (canZoom && event.key === "-") {
      event.preventDefault();
      setScale(view.scale - SCALE_STEP);
    } else if (canZoom && event.key === "0") {
      event.preventDefault();
      resetView();
    }
  };

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canZoom || view.scale <= MIN_SCALE) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pan = clampPan(
      drag.viewX + event.clientX - drag.startX,
      drag.viewY + event.clientY - drag.startY,
      view.scale,
    );
    setView((currentView) => ({ ...currentView, ...pan }));
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPortal>
        <DialogBackdrop
          className={cx(sx(styles.backdrop), "atelier-motion-backdrop", className)}
        />
        <DialogPopup
          className={cx(sx(styles.popup), "atelier-motion-fullscreen", className)}
          data-testid={testId}
          onKeyDown={handleKeyDown}
        >
          <header className={sx(styles.header)}>
            <div className={sx(styles.headingGroup)}>
              <DialogTitle className={sx(styles.title)}>
                {title || current?.alt || "Media viewer"}
              </DialogTitle>
              {gallery ? (
                <span className={sx(styles.counter)}>
                  {activeIndex + 1} / {items.length}
                </span>
              ) : null}
            </div>
            <div className={sx(styles.headerActions)}>
              {canZoom ? (
                <div aria-label="Zoom controls" className={sx(styles.toolbar)}>
                  <Button
                    aria-label="Zoom out"
                    disabled={view.scale <= MIN_SCALE}
                    onClick={() => setScale(view.scale - SCALE_STEP)}
                    size="iconSm"
                    variant="quiet"
                  >
                    <ZoomOut aria-hidden />
                  </Button>
                  <Button
                    aria-label="Reset zoom"
                    className={sx(styles.zoomReadout)}
                    disabled={view.scale === MIN_SCALE}
                    onClick={resetView}
                    size="sm"
                    variant="quiet"
                  >
                    {Math.round(view.scale * 100)}%
                  </Button>
                  <Button
                    aria-label="Zoom in"
                    disabled={view.scale >= MAX_SCALE}
                    onClick={() => setScale(view.scale + SCALE_STEP)}
                    size="iconSm"
                    variant="quiet"
                  >
                    <ZoomIn aria-hidden />
                  </Button>
                </div>
              ) : null}
              <DialogClose
                render={
                  <Button
                    aria-label={closeLabel}
                    size="iconSm"
                    variant="secondary"
                  />
                }
              >
                <X aria-hidden />
              </DialogClose>
            </div>
          </header>

          <div className={sx(styles.stage)}>
            {current ? (
              <div
                className={sx(
                  styles.mediaSurface,
                  canZoom && view.scale > MIN_SCALE && styles.mediaZoomed,
                  dragging && styles.mediaDragging,
                )}
                onClick={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    view.scale === MIN_SCALE
                  ) {
                    onOpenChange(false);
                  }
                }}
                onDoubleClick={() => {
                  if (canZoom) {
                    if (view.scale > MIN_SCALE) resetView();
                    else setScale(2);
                  }
                }}
                onPointerCancel={endPan}
                onPointerDown={startPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
              >
                {current.type === "video" ? (
                  <video
                    aria-label={current.alt}
                    className={sx(styles.media)}
                    controls
                    src={current.src}
                  />
                ) : (
                  <img
                    alt={current.alt}
                    className={sx(styles.media, styles.mediaMotion)}
                    draggable={false}
                    ref={mediaRef}
                    src={current.src}
                    style={{
                      transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                    }}
                  />
                )}
              </div>
            ) : (
              <p className={sx(styles.empty)}>No media to display.</p>
            )}

            {gallery ? (
              <>
                <span className={sx(styles.previous)}>
                  <Button
                    aria-label="Previous media"
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex(activeIndex - 1)}
                    size="iconLg"
                    variant="secondary"
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                </span>
                <span className={sx(styles.next)}>
                  <Button
                    aria-label="Next media"
                    disabled={activeIndex === lastIndex}
                    onClick={() => setActiveIndex(activeIndex + 1)}
                    size="iconLg"
                    variant="secondary"
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </span>
              </>
            ) : null}
          </div>

          {current?.caption ? (
            <DialogDescription className={sx(styles.caption)}>
              {current.caption}
            </DialogDescription>
          ) : null}
          <VisuallyHidden aria-live="polite">
            {current
              ? `Showing ${current.alt}${gallery ? `, item ${activeIndex + 1} of ${items.length}` : ""}`
              : "No media to display"}
          </VisuallyHidden>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}

const styles = stylex.create({
  backdrop: {
    backgroundColor: vars.colorOverlay,
    inset: 0,
    position: "fixed",
    zIndex: vars.zIndexOverlay,
  },
  popup: {
    backgroundColor: vars.colorCanvas,
    boxShadow: vars.elevationFlat,
    color: vars.colorText,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    inset: 0,
    minBlockSize: 0,
    minInlineSize: 0,
    outline: "none",
    position: "fixed",
    zIndex: vars.zIndexModal,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars.space16,
    justifyContent: "space-between",
    paddingBlock: vars.space12,
    paddingInline: vars.space20,
  },
  headingGroup: {
    alignItems: "baseline",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  counter: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
  },
  toolbar: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationLift,
    display: "flex",
    gap: vars.space4,
    padding: vars.space4,
  },
  zoomReadout: {
    minInlineSize: vars.controlHeightLg,
  },
  stage: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    display: "flex",
    justifyContent: "center",
    minBlockSize: 0,
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: vars.space16,
    paddingInline: {
      default: vars.space64,
      "@media (max-width: 640px)": vars.space16,
    },
    position: "relative",
  },
  mediaSurface: {
    alignItems: "center",
    blockSize: "100%",
    display: "flex",
    inlineSize: "100%",
    justifyContent: "center",
    minBlockSize: 0,
    minInlineSize: 0,
    overflow: "hidden",
    touchAction: "auto",
  },
  mediaZoomed: {
    cursor: "grab",
    touchAction: "none",
  },
  mediaDragging: {
    cursor: "grabbing",
  },
  media: {
    blockSize: "auto",
    maxBlockSize: "100%",
    maxInlineSize: "100%",
    objectFit: "contain",
    transformOrigin: "center",
  },
  mediaMotion: {
    transitionDuration: {
      default: vars.motionDurationQuick,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "transform",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  previous: {
    insetBlockStart: "50%",
    insetInlineStart: vars.space16,
    position: "absolute",
    transform: "translateY(-50%)",
  },
  next: {
    insetBlockStart: "50%",
    insetInlineEnd: vars.space16,
    position: "absolute",
    transform: "translateY(-50%)",
  },
  caption: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationLift,
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    marginBlockEnd: vars.space16,
    marginBlockStart: 0,
    marginInline: "auto",
    maxInlineSize: `min(640px, calc(100dvw - ${vars.space32}))`,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    textAlign: "center",
  },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
});

