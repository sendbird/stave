import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Styles for the dev-only composer frame preview root. */
export const composerFramePreviewStyles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    flexShrink: 0,
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-16"],
  },
  headerTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  headerNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  headerControls: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    marginInlineStart: "auto",
  },
  toggle: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: 10,
  },
  toggleActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-text"],
  },
  statusNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  workspace: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
  main: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    position: "relative",
  },
  /** The Task panel's Activity tab at its usual rail width. */
  panel: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: 384,
    minHeight: 0,
    borderInlineStartColor: vars["--aui-color-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--aui-border-width-hairline"],
    backgroundColor: vars["--aui-color-surface"],
  },
  /** Where the floating card lives, like ChatArea's message-pane overlay. */
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  conversation: {
    position: "relative",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flex: 1,
    flexDirection: "column",
    fontSize: vars["--aui-font-size-body"],
    justifyContent: "flex-end",
    minHeight: 0,
    overflow: "hidden",
    paddingBlock: vars["--aui-space-24"],
    paddingInline: vars["--aui-space-16"],
  },
  conversationMeasure: {
    marginInline: "auto",
    paddingInline: vars["--aui-space-12"],
    width: "100%",
    maxWidth: "72rem",
    "@media (min-width: 40rem)": {
      paddingInline: vars["--aui-space-20"],
    },
  },
  conversationBody: {
    color: vars["--aui-color-text"],
    marginTop: vars["--aui-space-12"],
    maxWidth: "42rem",
  },
  composerDock: {
    flexShrink: 0,
    position: "relative",
    zIndex: vars["--aui-z-index-app-chrome"],
  },
  composerPad: {
    backgroundColor: vars["--aui-color-canvas"],
    paddingBlock: 10,
    paddingInline: vars["--aui-space-12"],
    "@media (min-width: 40rem)": {
      paddingInline: vars["--aui-space-16"],
    },
  },
  composerMeasure: {
    marginInline: "auto",
  },
  enhanceAnchor: {
    blockSize: 0,
    inlineSize: "100%",
  },
  composerMeasureWide: {
    maxWidth: "72rem",
  },
  composerMeasureSqueezed: {
    maxWidth: 820,
  },
});
