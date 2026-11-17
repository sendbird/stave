import { i18n, useTranslation } from "@/i18n";
import { Tooltip } from "./Tooltip";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import type * as React from "react";

import {
  PopoverArrow,
  PopoverClose,
  PopoverDescription,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
  type PopoverRootProps,
} from "../headless/popover";
import { controlChrome } from "../recipes/control-chrome";
import {
  controlHeightBySize,
  controlIconSizes,
  controlSquares,
} from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import {
  type OverlayContentDensity,
  overlayContentDensity,
  overlayDensityTier,
  overlaySurface,
  overlayTitleGroupDensity,
} from "../recipes/overlay-surface";
import { surfaceChrome } from "../recipes/surface-chrome";
import {
  PortalProductThemeScope,
  usePortalProductThemeProps,
} from "../theming/ProductThemeProvider";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import {
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolvePlacement,
} from "../utils/placement";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type PopoverTriggerSize = "sm" | "md" | "lg";

/** Internal surface air; no air at all is `padding={false}`. */
export type PopoverDensity = Exclude<OverlayContentDensity, "flush">;

/**
 * Props passed straight through to the trigger part — the one place the
 * trigger is configured: `size` (sm 32 / md 36 / lg 40, from the shared
 * control-metrics map; `lg` aligns a popover trigger with a `lg` Button or
 * TextField in the same row), plus `id`, `aria-*`, handlers and `disabled`.
 */
export type PopoverTriggerProps = Omit<
  React.ComponentProps<typeof PopoverTrigger>,
  "children" | "className" | "render"
> & {
  /** @default "md" */
  size?: PopoverTriggerSize;
};

export type PopoverProps = Omit<PopoverRootProps, "children"> & {
  children: React.ReactNode;
  description?: React.ReactNode;
  /** Compact controls beside the title and before Close. */
  headerActions?: React.ReactNode;
  /** Internal surface air: `regular` or `compact`. @default "regular" */
  density?: PopoverDensity;
  /**
   * `false` removes the panel's own padding and gap so the content can run its
   * rules and rows edge to edge; the header keeps one gutter of its own and the
   * body owns the rest. The popup reflects it as `data-density="flush"`.
   * @default true
   */
  padding?: boolean;
  /** Where the panel opens against its trigger. @default "bottom-start" */
  placement?: PopupPlacement;
  title: React.ReactNode;
  trigger: React.ReactNode;
  /** Props for the trigger part, including its `size`. */
  triggerProps?: PopoverTriggerProps;
} & XstyleProp;

export function Popover({
  children,
  description,
  headerActions,
  density: densityProp = "regular",
  padding = true,
  placement,
  title,
  trigger,
  triggerProps,
  xstyle,
  ...props
}: PopoverProps) {
  useTranslation();
  const anchored = resolvePlacement(placement);
  // `padding={false}` keeps reflecting `data-density="flush"` (the theme
  // contract the surface has always published).
  const flush = padding === false;
  const density: OverlayContentDensity = flush ? "flush" : densityProp;
  const { size: triggerSize = "md", ...triggerPassThrough } =
    triggerProps ?? {};
  // The trigger stays in the provider's tree; only the popup portals out, so
  // only the popup carries the brand across the portal (see Dialog).
  const triggerTheme = themeProps("popover-trigger", { size: triggerSize });
  const popupTheme = themeProps("popover-popup", { density });
  const portalTheme = usePortalProductThemeProps();
  return (
    <PopoverRoot {...props}>
      <PopoverTrigger
        {...triggerPassThrough}
        {...triggerTheme}
        className={(state) =>
          cx(
            sx(
              styles.trigger,
              triggerSizeStyles[triggerSize],
              // Color state comes from the shared control chrome so the trigger
              // reacts exactly like the `Button variant="secondary"` it visually
              // quotes (§2), and stays visibly held while the popup is open.
              controlChrome.trigger,
              // Owns the transition (border AND keyboard focus halo); no
              // `transition.colors` after it, which would drop the halo.
              controlChrome.triggerFocusBorder,
              focusRing.borderOnly,
              controlHeightBySize[triggerSize],
              state.open && controlChrome.triggerOpen,
            ),
            triggerTheme.className,
          )
        }
      >
        {trigger}
      </PopoverTrigger>
      <PopoverPortal>
        <PortalProductThemeScope>
          <PopoverPositioner
            align={anchored.align}
            className={sx(styles.positioner)}
            side={anchored.side}
            sideOffset={POPUP_SIDE_OFFSET}
          >
            <PopoverPopup
              {...portalTheme}
              {...popupTheme}
              className={cx(
                sx(
                  overlaySurface.anchored,
                  styles.popup,
                  overlayContentDensity[density],
                  xstyle,
                ),
                popupTheme.className,
                "atelier-motion-dropdown",
              )}
            >
              <PopoverArrow
                {...themeSlotProps("popover-popup", "arrow")}
                className={sx(styles.arrow)}
              />
              <div
                {...themeSlotProps("popover-popup", "header")}
                className={sx(styles.header, headerActions != null && styles.headerWithActions, flush && styles.headerFlush)}
              >
                <div
                  className={sx(
                    styles.titleGroup,
                    overlayTitleGroupDensity[overlayDensityTier(density)],
                  )}
                >
                  <PopoverTitle
                    {...themeSlotProps("popover-popup", "title")}
                    className={sx(styles.title)}
                  >
                    {title}
                  </PopoverTitle>
                  {description ? (
                    <PopoverDescription
                      {...themeSlotProps("popover-popup", "description")}
                      className={sx(styles.description)}
                    >
                      {description}
                    </PopoverDescription>
                  ) : null}
                </div>
                <div className={sx(styles.headerControls)}>
                  {headerActions}
                  <Tooltip content={i18n.t("ui:popover.close")}>
                    <PopoverClose
                      {...themeSlotProps("popover-popup", "close")}
                      className={sx(
                        surfaceChrome.quietIconButton,
                        controlSquares.sm,
                        focusRing.ring,
                      )}
                      aria-label={i18n.t("ui:popover.close")}
                      // 16px glyph in the 32px quiet square, same as Dialog's close —
                      // it shipped at 14px, which read as a different (weaker) button
                      // on an otherwise identical surface. Sized through the tokenized
                      // control-icon custom property rather than a literal `size`.
                      data-aui-control-icon-button="true"
                      style={
                        {
                          "--aui-control-icon-size": controlIconSizes.md,
                        } as React.CSSProperties
                      }
                    >
                      <X aria-hidden />
                    </PopoverClose>
                  </Tooltip>
                </div>
              </div>
              <div
                {...themeSlotProps("popover-popup", "body")}
                className={sx(
                  styles.body,
                  // No gutter on a flush surface: the ring bleed is paid for by
                  // the popup's padding, and a flush popup has none. A focusable
                  // row inside a flush popover therefore composes
                  // `focusRing.ringInset`, the same answer the `line` tab strip
                  // gives for the same reason.
                  flush ? styles.bodyFlush : focusRing.gutter,
                )}
              >
                {children}
              </div>
            </PopoverPopup>
          </PopoverPositioner>
        </PortalProductThemeScope>
      </PopoverPortal>
    </PopoverRoot>
  );
}

const styles = stylex.create({
  /**
   * Trigger **layout** only — the resting/hover/press/open colors come from
   * `controlChrome.trigger` at the call site (design-direction §2: overlay
   * triggers compose Button rather than re-implementing its chrome).
   */
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    cursor: "pointer",
    display: "inline-flex",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-8"],
    justifyContent: "center",
    paddingBlock: 0,
  },
  // Inline gutters mirror Button (sm space8 / md space12 / lg space16 + the 15px
  // lg type step) so a Button and a popover trigger in one row line up.
  triggerSm: {
    paddingInline: vars["--aui-space-8"],
  },
  triggerMd: {
    paddingInline: vars["--aui-space-12"],
  },
  triggerLg: {
    fontSize: vars["--aui-font-size-lead"],
    paddingInline: vars["--aui-space-16"],
  },
  positioner: {
    zIndex: vars["--aui-z-index-dropdown"],
  },
  popup: {
    // elevationOverlay — a popover is a transient popup anchored to its trigger, not
    // a detached global surface (elevationModal). Confirmed against the elevation
    // policy in tokens.stylex.ts; unchanged.
    display: "grid",
    // Header stays put; the body row is the one that shrinks and scrolls when
    // the anchored clamp below bites. (The Arrow is `position: absolute` via
    // Base UI, so it is out of flow and not a grid row.)
    gridTemplateRows: "auto minmax(0, 1fr)",
    inlineSize: "min(340px, calc(100dvw - 32px))",
    // Anchored height clamp, same shape as `menu.popupClamp`: never taller than
    // the space the positioner reports, with a viewport-sized fallback for the
    // frame before `--available-height` is set. Without it a tall popover ran
    // off the viewport with no way to reach its own content. `overflow` stays
    // visible on the popup because the Arrow paints outside its border box —
    // the scroll lives on `body` instead.
    maxBlockSize: "min(420px, var(--available-height, calc(100vh - 32px)))",
    // Padding rule (see `recipes/menu.ts`): row-hosting popups (menu, listbox)
    // pad with `space4` and let each row own its inner padding; a Popover is a
    // *content* surface, so it pads with `space16` — one step under Dialog's
    // `space20`, because an anchored 340px panel next to its trigger needs less
    // margin than a centered modal that owns the screen.
  },
  arrow: {
    color: vars["--aui-color-surface-raised"],
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  headerWithActions: { alignItems: "center" },
  headerControls: { display: "flex", alignItems: "center", flexShrink: 0, gap: vars["--aui-space-8"] },
  /**
   * The header's own gutter on a `flush` surface, and the ONE inner gutter the
   * flush anatomy declares: `space16` inline (the padding the regular content
   * tier would have paid) with `space12` under the title group, so a body that
   * opens with a rule meets the header at a hairline instead of floating below
   * a full padding step. Content below owns the same `space16` inline gutter —
   * one scale for the whole panel, which is what keeps the rules aligned.
   */
  headerFlush: {
    paddingBlockEnd: vars["--aui-space-12"],
    paddingBlockStart: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-16"],
  },
  titleGroup: {
    display: "grid",
  },
  // Overlay-surface title role (§5): 17px semibold on the 24px heading line
  // box with snug tracking — identical to Dialog/AlertDialog/Drawer. It used to
  // sit at 14px, so the same title read as an in-flow Card heading.
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-lead"],
    margin: 0,
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  // `focusRing.gutter` is composed at the call site: `popup` pays `space16`, but
  // that padding is on the element that does not clip. This is the scroller, so
  // it owes the ring its own bleed gutter (see Dialog's `body`).
  body: {
    color: vars["--aui-color-text"],
    display: "grid",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-12"],
    lineHeight: vars["--aui-line-height-normal"],
    // Pair for the popup's height clamp: the body is the scroll area, so a long
    // popover keeps its title and close button visible instead of overflowing.
    // `minBlockSize: 0` is required — a grid item's automatic minimum size
    // would otherwise refuse to shrink below its content and defeat the clamp.
    minBlockSize: 0,
    overflowY: "auto",
  },
  // A flush body is a scroller with no gutter of its own; its children draw
  // their own edge-to-edge rules and pay their own inline padding.
  bodyFlush: {
    paddingInline: 0,
  },
});

const triggerSizeStyles = {
  lg: styles.triggerLg,
  md: styles.triggerMd,
  sm: styles.triggerSm,
} as const;

// Host modification: `../../ui/popover` composes Popover's canonical keys for
// its compound API, so the style object stays exported.
export { styles as popoverStyles };
