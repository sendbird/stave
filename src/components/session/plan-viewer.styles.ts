import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The plan/todo floater card width when minimized or dragged (was `w-72`).
 */
const FLOATER_MINIMIZED_WIDTH = "18rem";

export const planViewerStyles = stylex.create({
  /**
   * Outer floating wrapper. Clicks fall through until an inner card opts back
   * in via `cardBase`'s `pointerEvents: "auto"`. Composed with the shared
   * session-floater layer class by its consumers.
   */
  floatingWrapper: {
    pointerEvents: "none",
    position: "absolute",
  },
  cardBase: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-overlay"],
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "auto",
  },
  cardExpanded: {
    height: "100%",
    width: "100%",
  },
  cardMinimized: {
    width: FLOATER_MINIMIZED_WIDTH,
  },
});


export const planViewerElementStyles = stylex.create({
  header: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingBlock: "0.625rem",
    paddingInline: vars["--ads-space-16"],
  },
  dragHandle: {
    alignItems: "center",
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    gap: vars["--ads-space-8"],
    minWidth: 0,
    overflow: "hidden",
    userSelect: "none",
  },
  dragHandleGrab: {
    cursor: "grab",
  },
  headerIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
  },
  headerTitle: {
    flexGrow: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerButton: {
    borderRadius: vars["--ads-radius-mark"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    padding: vars["--ads-space-2"],
  },
  body: {
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  bodyExpanded: {
    flexGrow: 1,
  },
  bodyNormal: {
    maxHeight: "18rem",
  },
  reviseRegion: {
    flexShrink: 0,
    padding: vars["--ads-space-12"],
  },
  revisionField: {
    backgroundColor: vars["--ads-color-canvas"],
    fontSize: vars["--ads-font-size-lead"],
    lineHeight: vars["--ads-line-height-relaxed"],
    minHeight: 72,
  },
  reviseActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-8"],
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  notice: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
  },
});
