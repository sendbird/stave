import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Chip height. The bar is a single compact row between the tab strip and chat,
 * and every control in it — chip, chip actions, "Manage presets" — sits on the
 * ADS `sm` control rung (`controlHeightSm`, 32px) so the row has one baseline
 * instead of the previous 28px chip / 20px action / 28px cog mix.
 */
const CHIP_HEIGHT = vars["--ads-control-height-sm"];

/**
 * The chip publishes its hover state as a custom property so the trailing
 * actions button can reveal itself: StyleX conditions only see the element
 * they are declared on, so a parent-driven reveal has to travel through a
 * variable rather than a `group-hover` descendant selector.
 */
const CHIP_ACTION_OPACITY = "--presetChipActionOpacity";

export const presetBarStyles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  chips: {
    alignItems: "center",
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    gap: vars["--ads-space-4"],
    minWidth: 0,
    overflowX: "auto",
  },
  trailing: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },
  restore: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    height: CHIP_HEIGHT,
    paddingInline: vars["--ads-space-8"],
  },
  manage: {
    borderRadius: vars["--ads-radius-control"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    flexShrink: 0,
    height: CHIP_HEIGHT,
    width: CHIP_HEIGHT,
  },
  chip: {
    [CHIP_ACTION_OPACITY]: {
      default: "0",
      ":hover": "1",
    },
    alignItems: "stretch",
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    color: vars["--ads-color-text"],
    display: "flex",
    flexShrink: 0,
    height: CHIP_HEIGHT,
    position: "relative",
  },
  chipApply: {
    alignItems: "center",
    borderEndEndRadius: 0,
    borderEndStartRadius: vars["--ads-radius-control"],
    borderStartEndRadius: 0,
    borderStartStartRadius: vars["--ads-radius-control"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    lineHeight: vars["--ads-line-height-control"],
    minWidth: 0,
    paddingInline: vars["--ads-space-8"],
  },
  chipIcon: {
    flexShrink: 0,
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  chipLabel: {
    maxWidth: 140,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipCliMark: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  chipActions: {
    borderEndEndRadius: vars["--ads-radius-control"],
    borderEndStartRadius: 0,
    borderStartEndRadius: vars["--ads-radius-control"],
    borderStartStartRadius: 0,
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: "100%",
    opacity: {
      default: `var(${CHIP_ACTION_OPACITY}, 0)`,
      ":focus": 1,
      ":focus-visible": 1,
      ":is([data-popup-open])": 1,
    },
    paddingInline: 0,
    // Trailing half of the split chip: `xs` iconOnly geometry (its glyph rides
    // the shared `controlIconSizeSm` rung) stretched to the chip's own height
    // so the two halves share one 32px box and one baseline.
    width: vars["--ads-control-height-xs"],
  },
  chipMenu: {
    width: 160,
  },
  chipEditor: {
    width: 288,
  },
});
