import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Styles for the editor surface toolbar row rendered above a single editor
 * pane. Icon-button geometry (`iconButton`) intentionally overrides the AUI
 * control size so the toolbar keeps its compact 28px square affordances; it is
 * passed through the button `xstyle` prop.
 */
export const editorSurfaceToolbarStyles = stylex.create({
  bar: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    paddingInline: vars["--aui-space-12"],
  },
  pathTrigger: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  pathText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dirtyDot: {
    backgroundColor: vars["--aui-color-success"],
    borderRadius: vars["--aui-radius-full"],
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
    gap: vars["--aui-space-4"],
  },
  inlineFlex: {
    display: "inline-flex",
  },
  iconButton: {
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    height: 28,
    padding: 0,
    width: 28,
  },
  iconButtonActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-accent"],
  },
  reviewButton: {
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    height: 28,
    padding: 0,
    position: "relative",
    width: 28,
  },
});
