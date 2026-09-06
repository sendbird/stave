import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** Chip height; the bar is a single compact row between the tab strip and chat. */
const CHIP_HEIGHT = 28;

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
    backgroundColor: vars.colorCanvasSubtle,
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    minWidth: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  chips: {
    alignItems: "center",
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    gap: vars.space4,
    minWidth: 0,
    overflowX: "auto",
  },
  trailing: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space4,
  },
  restore: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    height: CHIP_HEIGHT,
    paddingInline: vars.space8,
  },
  manage: {
    borderRadius: vars.radiusControl,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
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
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    color: vars.colorText,
    display: "flex",
    flexShrink: 0,
    height: CHIP_HEIGHT,
    position: "relative",
  },
  chipApply: {
    alignItems: "center",
    borderEndEndRadius: 0,
    borderEndStartRadius: vars.radiusControl,
    borderStartEndRadius: 0,
    borderStartStartRadius: vars.radiusControl,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: 6,
    minWidth: 0,
    paddingInline: vars.space8,
  },
  chipIcon: {
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  chipLabel: {
    maxWidth: 140,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipCliMark: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  chipActions: {
    borderEndEndRadius: vars.radiusControl,
    borderEndStartRadius: 0,
    borderStartEndRadius: vars.radiusControl,
    borderStartStartRadius: 0,
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: "100%",
    opacity: {
      default: `var(${CHIP_ACTION_OPACITY}, 0)`,
      ":focus": 1,
      ":focus-visible": 1,
      ":is([data-popup-open])": 1,
    },
    paddingInline: 0,
    width: 20,
  },
  chipActionsIcon: {
    height: 12,
    width: 12,
  },
  chipMenu: {
    width: 160,
  },
  chipEditor: {
    width: 288,
  },
});
