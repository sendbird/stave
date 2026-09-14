import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The toast stack's own geometry and paint, split out of `ToastHost.tsx`
 * verbatim.
 *
 * A move, not a rewrite: the declarations below are byte-identical to the ones
 * that lived at the bottom of `ToastHost.tsx`, and they left because the stable
 * theme-target attributes pushed that file over the 500-line source limit.
 */
export const styles = stylex.create({
  viewport: {
    inlineSize: `min(360px, calc(100dvw - ${vars["--ads-space-32"]}))`,
    position: "fixed",
    zIndex: vars["--ads-z-index-toast"],
  },
  viewportTop: {
    insetBlockStart: vars["--ads-space-20"],
  },
  viewportBottom: {
    insetBlockEnd: vars["--ads-space-20"],
  },
  viewportLeft: {
    insetInlineStart: vars["--ads-space-20"],
  },
  viewportRight: {
    insetInlineEnd: vars["--ads-space-20"],
  },
  viewportCenter: {
    insetInlineStart: "50%",
    transform: "translateX(-50%)",
  },
  toast: {
    backgroundColor: vars["--ads-color-surface-raised"],
    blockSize: "var(--toast-height)",
    borderColor: vars["--ads-color-media-edge"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // elevation4 — a toast is a detached global surface: it sits on the highest
    // z band (`zIndexToast`) precisely so feedback is never occluded, and it
    // floats over whatever is already on screen. elevation3 gave it a
    // dropdown's depth (tokens.stylex.ts elevation policy).
    boxShadow: vars["--ads-elevation-modal"],
    color: vars["--ads-color-text"],
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
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  // Flex row: [icon?] [copy 1fr] [inline action?] [close]. Single-line
  // toasts center everything; multi-line toasts top-align the trailing chrome.
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
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
    blockSize: `calc(${vars["--ads-font-size-body"]} * ${vars["--ads-line-height-tight"]})`,
  },
  iconInfo: { color: vars["--ads-color-info"] },
  iconLoading: { color: vars["--ads-color-text-muted"] },
  iconSuccess: { color: vars["--ads-color-success"] },
  iconWarning: { color: vars["--ads-color-warning"] },
  iconDanger: { color: vars["--ads-color-danger"] },
  copy: {
    display: "grid",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  // Bottom-end action row for multi-line toasts (toast-stack anatomy). It sits
  // outside the row so the button's trailing edge is flush with the card's
  // inline padding, aligned with the close button above it.
  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBlockStart: vars["--ads-space-12"],
  },
});

export const toneIconStyles = {
  danger: styles.iconDanger,
  info: styles.iconInfo,
  loading: styles.iconLoading,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
} as const;
