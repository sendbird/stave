import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Saved-plan list: header, empty state, and the per-plan row cluster. */
export const planStyles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  headerText: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"] },
  headerTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  headerHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  headerBadge: { borderRadius: vars["--aui-radius-mark"] },
  refreshButton: {
    borderRadius: vars["--aui-radius-mark"],
    blockSize: vars["--aui-control-height-sm"],
  },
  refreshIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
    marginRight: vars["--aui-space-4"],
  },
  spinning: {
    animationDuration: {
      default: vars["--aui-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  unavailable: {
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
    backgroundColor: vars["--aui-color-surface-tint"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  loading: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-8"],
  },
  smallIcon: { blockSize: vars["--aui-control-icon-size-sm"], inlineSize: vars["--aui-control-icon-size-sm"] },
  // Box, type ramp, and spacing all come from AUI `EmptyState` now; only the
  // action row (a centered wrap row, not the default stacked grid) and the
  // medallion glyph size stay local.
  emptyIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  emptyActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    justifyContent: "center",
  },
  refreshFailed: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-danger-soft"],
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-danger-text"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    marginBlockEnd: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  /* Row shape, hover wash and trail live in `information-row.styles.ts`, which
     this list shares with the linked-pull-request rows above it. Only the two
     things that belong to a plan specifically stay here. */
  rowMark: { color: vars["--aui-color-text-muted"] },
  rowAction: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    blockSize: vars["--aui-icon-button-size"],
    borderRadius: vars["--aui-radius-control"],
    color: {
      default: vars["--aui-color-text-subtle"],
      ":hover": vars["--aui-color-text"],
    },
    display: "flex",
    flexShrink: 0,
    inlineSize: vars["--aui-icon-button-size"],
    justifyContent: "center",
  },
  rowActionDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-danger-soft"],
    },
    color: {
      default: vars["--aui-color-text-subtle"],
      ":focus-visible": vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
  rowActionIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  card: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border-subtle"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  cardContent: { paddingTop: vars["--aui-space-16"] },
});

/** The search above a long list and the count line under it. */
export const planListControlStyles = stylex.create({
  status: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    lineHeight: vars["--aui-line-height-tight"],
    paddingInlineStart: vars["--aui-space-8"],
  },
  statusText: { minWidth: 0 },
});
