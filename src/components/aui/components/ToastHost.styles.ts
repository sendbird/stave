import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/** Geometry and token-based paint for the shared toast stack. */
export const styles = stylex.create({
  viewport: {
    inlineSize: `min(360px, calc(100dvw - ${vars["--aui-space-32"]}))`,
    position: "fixed",
    zIndex: vars["--aui-z-index-toast"],
  },
  viewportTop: {
    insetBlockStart: vars["--aui-space-20"],
  },
  viewportBottom: {
    insetBlockEnd: vars["--aui-space-20"],
  },
  viewportLeft: {
    insetInlineStart: vars["--aui-space-20"],
  },
  viewportRight: {
    insetInlineEnd: vars["--aui-space-20"],
  },
  viewportCenter: {
    insetInlineStart: "50%",
    transform: "translateX(-50%)",
  },
  toast: {
    backgroundColor: vars["--aui-color-surface-raised"],
    blockSize: "var(--toast-height)",
    borderColor: vars["--aui-color-media-edge"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    // elevation4 — a toast is a detached global surface: it sits on the highest
    // z band (`zIndexToast`) precisely so feedback is never occluded, and it
    // floats over whatever is already on screen. elevation3 gave it a
    // dropdown's depth (tokens.stylex.ts elevation policy).
    boxShadow: vars["--aui-elevation-modal"],
    color: vars["--aui-color-text"],
    inlineSize: "100%",
    overflow: "hidden",
    position: "absolute",
    // Stacking transform + transitions live in `.atelier-toast-stack` (+`-top`).
    userSelect: "none",
  },
  toastBottom: {
    insetBlockEnd: 0,
    insetInlineEnd: 0,
    insetInlineStart: "auto",
    transformOrigin: "bottom center",
  },
  toastTop: {
    insetBlockStart: 0,
    insetInlineEnd: 0,
    insetInlineStart: "auto",
    transformOrigin: "top center",
  },
  toastLimited: {
    opacity: 0,
  },
  // Column: the main row, then the multi-line action row underneath it. The
  // action row is a sibling of the row rather than a child of `copy` so it
  // spans the close column too; nesting it in `copy` inset its trailing edge
  // by the close button's width plus the row gap.
  content: {
    display: "flex",
    flexDirection: "column",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  // Flex row: [icon?] [copy 1fr] [inline action?] [close]. Single-line
  // toasts center everything; multi-line toasts top-align the trailing chrome.
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  rowMultiline: {
    alignItems: "flex-start",
  },
  // Tone reads from the icon (neutral card), matching Alert/Banner. The slot is
  // a centring box so the glyph never needs a hand nudge.
  icon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  iconMultiline: {
    // A multi-line toast top-aligns its row, so the glyph must centre on the
    // title's FIRST line box, not on the whole card. Giving the slot exactly
    // that line box (title font size × its line height) and letting flex centre
    // the glyph inside it replaces the banned `marginBlockStart: 1` optical
    // nudge — and it now tracks the type scale instead of one hard-coded pixel.
    alignSelf: "start",
    blockSize: `calc(${vars["--aui-font-size-body"]} * ${vars["--aui-line-height-tight"]})`,
  },
  iconInfo: { color: vars["--aui-color-info"] },
  iconLoading: { color: vars["--aui-color-text-muted"] },
  iconSuccess: { color: vars["--aui-color-success"] },
  iconWarning: { color: vars["--aui-color-warning"] },
  iconDanger: { color: vars["--aui-color-danger"] },
  copy: {
    display: "grid",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  title: {
    overflowWrap: "anywhere",
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
  },
  description: {
    overflowWrap: "anywhere",
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  // Bottom-end action row for multi-line toasts (toast-stack anatomy). It sits
  // outside the row so the button's trailing edge is flush with the card's
  // inline padding, aligned with the close button above it.
  actionRow: {
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
    marginBlockStart: vars["--aui-space-12"],
  },
});

export const toneIconStyles = {
  danger: styles.iconDanger,
  info: styles.iconInfo,
  loading: styles.iconLoading,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
} as const;
