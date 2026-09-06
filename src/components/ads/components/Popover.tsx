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
import { surfaceChrome } from "../recipes/surface-chrome";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import {
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolvePlacement,
} from "../utils/placement";
import { cx, sx } from "../utils/stylex";

export type PopoverTriggerSize = "sm" | "md" | "lg";

export type PopoverProps = Omit<PopoverRootProps, "children"> & {
  children: React.ReactNode;
  description?: React.ReactNode;
  /** Where the panel opens against its trigger. @default "bottom-start" */
  placement?: PopupPlacement;
  title: React.ReactNode;
  trigger: React.ReactNode;
  /**
   * Trigger control height, from the shared control-metrics map (sm 32 /
   * md 36 / lg 40). `lg` exists so a popover trigger can align with a `lg`
   * Button or TextField in the same row.
   * @default "md"
   */
  triggerSize?: PopoverTriggerSize;
};

export function Popover({
  children,
  description,
  placement,
  title,
  trigger,
  triggerSize = "md",
  ...props
}: PopoverProps) {
  const anchored = resolvePlacement(placement);
  return (
    <PopoverRoot {...props}>
      <PopoverTrigger
        className={(state) =>
          sx(
            styles.trigger,
            triggerSizeStyles[triggerSize],
            // Color state comes from the shared control chrome so the trigger
            // reacts exactly like the `Button variant="secondary"` it visually
            // quotes (§2), and stays visibly held while the popup is open.
            controlChrome.trigger,
            controlChrome.triggerFocusBorder,
            transition.colors,
            focusRing.borderOnly,
            controlHeightBySize[triggerSize],
            state.open && controlChrome.triggerOpen,
          )
        }
      >
        {trigger}
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner
          align={anchored.align}
          className={sx(styles.positioner)}
          side={anchored.side}
          sideOffset={POPUP_SIDE_OFFSET}
        >
          <PopoverPopup
            className={cx(sx(styles.surface, styles.popup), "atelier-motion-dropdown")}
          >
            <PopoverArrow className={sx(styles.arrow)} />
            <div className={sx(styles.header)}>
              <div className={sx(styles.titleGroup)}>
                <PopoverTitle className={sx(styles.title)}>
                  {title}
                </PopoverTitle>
                {description ? (
                  <PopoverDescription className={sx(styles.description)}>
                    {description}
                  </PopoverDescription>
                ) : null}
              </div>
              <PopoverClose
                className={sx(
                  surfaceChrome.quietIconButton,
                  controlSquares.sm,
                  focusRing.ring,
                )}
                aria-label="Close"
                // 16px glyph in the 32px quiet square, same as Dialog's close —
                // it shipped at 14px, which read as a different (weaker) button
                // on an otherwise identical surface. Sized through the tokenized
                // control-icon custom property rather than a literal `size`.
                data-ads-control-icon-button="true"
                style={
                  {
                    "--ads-control-icon-size": controlIconSizes.md,
                  } as React.CSSProperties
                }
              >
                <X aria-hidden />
              </PopoverClose>
            </div>
            <div className={sx(styles.body, focusRing.gutter)}>{children}</div>
          </PopoverPopup>
        </PopoverPositioner>
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
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
    justifyContent: "center",
    paddingBlock: 0,
  },
  // Inline gutters mirror Button (sm space8 / md space12 / lg space16 + the 15px
  // lg type step) so a Button and a popover trigger in one row line up.
  triggerSm: {
    paddingInline: vars.space8,
  },
  triggerMd: {
    paddingInline: vars.space12,
  },
  triggerLg: {
    fontSize: vars.fontSizeLead,
    paddingInline: vars.space16,
  },
  positioner: {
    zIndex: vars.zIndexDropdown,
  },
  surface: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // elevationOverlay — a popover is a transient popup anchored to its trigger, not
    // a detached global surface (elevationModal). Confirmed against the elevation
    // policy in tokens.stylex.ts; unchanged.
    boxShadow: vars.elevationOverlay,
    color: vars.colorText,
  },
  popup: {
    display: "grid",
    gap: vars.space16,
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
    padding: vars.space16,
  },
  arrow: {
    color: vars.colorSurfaceRaised,
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  titleGroup: {
    display: "grid",
    gap: vars.space4,
  },
  // Overlay-surface title role (§5): 17px semibold on the 24px heading line
  // box with snug tracking — identical to Dialog/AlertDialog/Drawer. It used to
  // sit at 14px, so the same title read as an in-flow Card heading.
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightLead,
    margin: 0,
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
  },
  // `focusRing.gutter` is composed at the call site: `popup` pays `space16`, but
  // that padding is on the element that does not clip. This is the scroller, so
  // it owes the ring its own bleed gutter (see Dialog's `body`).
  body: {
    color: vars.colorText,
    display: "grid",
    fontSize: vars.fontSizeBody,
    gap: vars.space12,
    lineHeight: vars.lineHeightNormal,
    // Pair for the popup's height clamp: the body is the scroll area, so a long
    // popover keeps its title and close button visible instead of overflowing.
    // `minBlockSize: 0` is required — a grid item's automatic minimum size
    // would otherwise refuse to shrink below its content and defeat the clamp.
    minBlockSize: 0,
    overflowY: "auto",
  },
});

const triggerSizeStyles = {
  lg: styles.triggerLg,
  md: styles.triggerMd,
  sm: styles.triggerSm,
} as const;

export { styles as popoverStyles };
