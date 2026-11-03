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
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-12"],
  },
  pathTrigger: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  pathText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dirtyDot: {
    backgroundColor: vars["--ads-color-success"],
    borderRadius: vars["--ads-radius-full"],
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
    gap: vars["--ads-space-4"],
  },
  inlineFlex: {
    display: "inline-flex",
  },
  iconButton: {
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    height: 28,
    padding: 0,
    width: 28,
  },
  iconButtonActive: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-accent"],
  },
  reviewButton: {
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    height: 28,
    padding: 0,
    position: "relative",
    width: 28,
  },
});
