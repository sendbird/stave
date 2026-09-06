import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Styles for the editor surface toolbar row rendered above a single editor
 * pane. Icon-button geometry (`iconButton`) intentionally overrides the ADS
 * control size so the toolbar keeps its compact 28px square affordances; it is
 * passed through the button `xstyle` prop.
 */
export const editorSurfaceToolbarStyles = stylex.create({
  bar: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    justifyContent: "space-between",
    paddingInline: vars.space12,
  },
  pathTrigger: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    minWidth: 0,
  },
  pathText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dirtyDot: {
    backgroundColor: vars.colorSuccess,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  tooltipContent: {
    maxWidth: "24rem",
    wordBreak: "break-all",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
  },
  inlineFlex: {
    display: "inline-flex",
  },
  iconButton: {
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    height: 28,
    padding: 0,
    width: 28,
  },
  iconButtonActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorAccent,
  },
  diffViewGroup: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space2,
    padding: vars.space2,
  },
  diffViewButton: {
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    height: 24,
    padding: 0,
    width: 24,
  },
  diffViewButtonActive: {
    backgroundColor: vars.colorSelectionFill,
    color: vars.colorText,
  },
  reviewCountBadge: {
    alignItems: "center",
    backgroundColor: vars.colorAccent,
    borderColor: vars.colorCanvas,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorAccentText,
    display: "inline-flex",
    fontSize: 9,
    fontWeight: vars.fontWeightSemibold,
    height: 16,
    insetInlineEnd: -4,
    insetBlockStart: -4,
    justifyContent: "center",
    minWidth: 16,
    paddingInline: vars.space4,
    position: "absolute",
  },
  reviewButton: {
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    height: 28,
    padding: 0,
    position: "relative",
    width: 28,
  },
});
