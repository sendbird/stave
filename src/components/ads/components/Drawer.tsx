import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import * as React from "react";

import {
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerPopup,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
  type DrawerRootProps,
} from "../headless/drawer";
import { controlIconSizes, controlSquares } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Button } from "./Button";

export type DrawerSide = "bottom" | "left" | "right" | "top";

/**
 * How much of the screen the panel takes on its *main* axis — inline size for a
 * left/right drawer, block size for a top/bottom one. The cross axis is always
 * the full viewport, which is what makes a drawer a drawer.
 *
 * One measure for every drawer was the actual bug: an inspector that shows six
 * property rows and a full create-form both got 420px, so one was mostly empty
 * and the other made its own fields wrap. The ramp below is not a new scale —
 * each step is a measure the system already stands on somewhere else.
 */
export type DrawerSize = "sm" | "md" | "lg" | "full";

export type DrawerProps = Omit<DrawerRootProps, "children"> & {
  children: React.ReactNode;
  description?: React.ReactNode;
  side?: DrawerSide;
  /**
   * Panel measure on the docked axis. `md` (420px) is the default and renders
   * exactly what every existing caller renders today. @default "md"
   */
  size?: DrawerSize;
  title: React.ReactNode;
  trigger: React.ReactNode;
};

const sideToSwipeDirection = {
  bottom: "down",
  left: "left",
  right: "right",
  top: "up",
} as const;

/**
 * Which way the panel travels on enter/exit, as unit multipliers consumed by
 * `.atelier-motion-drawer` in `styles.css`. A drawer must move *toward the edge
 * it is docked to* — the shared class used to hard-wire `translateX(+d)`, so a
 * top or bottom drawer slid in sideways and a left drawer entered from the
 * right. Sign and axis are data, not four copies of the animation.
 */
const sideToAxis = {
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
} as const;

export function Drawer({
  children,
  description,
  side = "right",
  size = "md",
  title,
  trigger,
  ...props
}: DrawerProps) {
  // The side owns the cross axis and the seam border; the size owns the docked
  // axis. Splitting them is what keeps the map at 4 sides + 4 sizes instead of
  // the 16 popup styles a single combined lookup would need.
  const sizeStyle =
    side === "left" || side === "right"
      ? inlineSizeStyles[size]
      : blockSizeStyles[size];

  return (
    <DrawerRoot {...props} swipeDirection={sideToSwipeDirection[side]}>
      <DrawerTrigger
        render={
          React.isValidElement(trigger) && trigger.type === Button ? (
            (trigger as React.ReactElement)
          ) : (
            <Button>{trigger}</Button>
          )
        }
      />
      <DrawerPortal>
        <DrawerBackdrop
          className={cx(sx(styles.backdrop), "atelier-motion-backdrop")}
        />
        <DrawerViewport className={sx(styles.viewport, viewportStyles[side])}>
          <DrawerPopup
            className={cx(
              sx(styles.surface, styles.popup, popupSideStyles[side], sizeStyle),
              "atelier-motion-drawer",
            )}
            style={
              {
                "--atelier-drawer-axis-x": sideToAxis[side].x,
                "--atelier-drawer-axis-y": sideToAxis[side].y,
              } as React.CSSProperties
            }
          >
            <DrawerContent className={sx(styles.content)}>
              <div className={sx(styles.header)}>
                <div className={sx(styles.titleGroup)}>
                  <DrawerTitle className={sx(styles.title)}>
                    {title}
                  </DrawerTitle>
                  {description ? (
                    <DrawerDescription className={sx(styles.description)}>
                      {description}
                    </DrawerDescription>
                  ) : null}
                </div>
                <DrawerClose
                  className={sx(
                    surfaceChrome.quietIconButton,
                    controlSquares.sm,
                    focusRing.ring,
                  )}
                  aria-label="Close"
                  // Same close contract as Popover/Dialog: a 16px glyph in the
                  // 32px quiet square, sized through the tokenized control-icon
                  // custom property rather than a literal `size`.
                  data-ads-control-icon-button="true"
                  style={
                    {
                      "--ads-control-icon-size": controlIconSizes.md,
                    } as React.CSSProperties
                  }
                >
                  <X aria-hidden />
                </DrawerClose>
              </div>
              <div className={sx(styles.body, focusRing.gutter)}>
                {children}
              </div>
            </DrawerContent>
          </DrawerPopup>
        </DrawerViewport>
      </DrawerPortal>
    </DrawerRoot>
  );
}

const styles = stylex.create({
  backdrop: {
    backdropFilter: vars.motionBlurOverlay,
    backgroundColor: vars.colorOverlay,
    inset: 0,
    position: "fixed",
    zIndex: vars.zIndexOverlay,
  },
  viewport: {
    alignItems: "stretch",
    display: "flex",
    inset: 0,
    position: "fixed",
    zIndex: vars.zIndexModal,
  },
  viewportRight: {
    justifyContent: "flex-end",
  },
  viewportLeft: {
    justifyContent: "flex-start",
  },
  viewportTop: {
    alignItems: "flex-start",
    justifyContent: "stretch",
  },
  viewportBottom: {
    alignItems: "flex-end",
    justifyContent: "stretch",
  },
  surface: {
    backgroundColor: vars.colorSurfaceRaised,
    // elevationModal — a Drawer is a detached global surface that owns the screen
    // (it ships with a backdrop and a focus trap), not a popup anchored to a
    // trigger. elevationOverlay put it in the dropdown band (tokens.stylex.ts
    // elevation policy).
    boxShadow: vars.elevationModal,
    color: vars.colorText,
  },
  popup: {
    display: "grid",
    gap: vars.space20,
    // Single shrinkable row for `DrawerContent`. `1fr` is `minmax(auto, 1fr)`,
    // whose automatic minimum size is the content's — so a long drawer refused
    // to shrink and overflowed the panel instead of letting the body scroll.
    gridTemplateRows: "minmax(0, 1fr)",
    // Modal padding step (space20), matching Dialog/AlertDialog.
    padding: vars.space20,
    position: "relative",
  },
  // The four side styles carry the seam border and the CROSS axis only. The
  // docked axis moved out to the size maps below, so the two never declare the
  // same property and `size` cannot be silently overridden by `side`.
  popupRight: {
    blockSize: "100dvh",
    borderInlineStartColor: vars.colorMediaEdge,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars.borderWidthHairline,
  },
  popupLeft: {
    blockSize: "100dvh",
    borderInlineEndColor: vars.colorMediaEdge,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: vars.borderWidthHairline,
  },
  popupTop: {
    borderBlockEndColor: vars.colorMediaEdge,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    inlineSize: "100dvw",
  },
  popupBottom: {
    borderBlockStartColor: vars.colorMediaEdge,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    inlineSize: "100dvw",
  },
  // There is no width token family — the system names spacing, not panel
  // measures — so these are literals, each one already load-bearing elsewhere:
  //   sm  320px — the narrow content column `Calendar` and `PreviewCard` stand
  //               on; an inspector of property rows, nothing wider.
  //   md  420px — the shipped drawer measure, unchanged. Also `Command`'s
  //               inline panel and `CannedResponsePicker`.
  //   lg  560px — `Command`'s dialog width: the point where a two-column form
  //               row stops wrapping. A full form drawer wants this.
  //   full      — the whole viewport, for a takeover (an editor, a diff).
  // Every step clamps against the viewport so a phone gets `full` regardless.
  inlineSm: { inlineSize: "min(320px, 100dvw)" },
  inlineMd: { inlineSize: "min(420px, 100dvw)" },
  inlineLg: { inlineSize: "min(560px, 100dvw)" },
  inlineFull: { inlineSize: "100dvw" },
  blockSm: { blockSize: "min(320px, 100dvh)" },
  blockMd: { blockSize: "min(420px, 100dvh)" },
  blockLg: { blockSize: "min(560px, 100dvh)" },
  blockFull: { blockSize: "100dvh" },
  content: {
    blockSize: "100%",
    display: "grid",
    gap: vars.space20,
    // Header stays put; the body row is the one that shrinks and scrolls (same
    // model as Popover). `minmax(0, …)` is required — see `popup` above.
    gridTemplateRows: "auto minmax(0, 1fr)",
    minBlockSize: 0,
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: vars.space16,
    justifyContent: "space-between",
  },
  titleGroup: {
    display: "grid",
    gap: vars.space8,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightLead,
    margin: 0,
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
  },
  // `focusRing.gutter` is composed at the call site: `popup` pays `space20`, but
  // that padding is on the element that does not clip. This is the scroller, so
  // it owes the ring its own bleed gutter (see Dialog's `body`).
  body: {
    alignContent: "start",
    display: "grid",
    gap: vars.space16,
    // Pair for the shrinkable row above: a grid item's automatic minimum size
    // would otherwise refuse to go below its content and defeat the scroll.
    minBlockSize: 0,
    overflow: "auto",
  },
});

const viewportStyles = {
  bottom: styles.viewportBottom,
  left: styles.viewportLeft,
  right: styles.viewportRight,
  top: styles.viewportTop,
} as const;

const popupSideStyles = {
  bottom: styles.popupBottom,
  left: styles.popupLeft,
  right: styles.popupRight,
  top: styles.popupTop,
} as const;

const inlineSizeStyles = {
  full: styles.inlineFull,
  lg: styles.inlineLg,
  md: styles.inlineMd,
  sm: styles.inlineSm,
} as const;

const blockSizeStyles = {
  full: styles.blockFull,
  lg: styles.blockLg,
  md: styles.blockMd,
  sm: styles.blockSm,
} as const;

export { styles as drawerStyles };
