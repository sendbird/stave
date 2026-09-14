import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Saved-plan list: header, empty state, and the per-plan row cluster. */
export const planStyles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  headerText: { display: "flex", flexDirection: "column", gap: vars["--ads-space-2"] },
  headerTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  headerHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  headerBadge: { borderRadius: vars["--ads-radius-mark"] },
  refreshButton: {
    borderRadius: vars["--ads-radius-mark"],
    blockSize: vars["--ads-control-height-sm"],
  },
  refreshIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
    marginRight: vars["--ads-space-4"],
  },
  spinning: {
    animationDuration: {
      default: vars["--ads-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  unavailable: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    backgroundColor: vars["--ads-color-surface-tint"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  loading: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-8"],
  },
  smallIcon: { blockSize: vars["--ads-control-icon-size-sm"], inlineSize: vars["--ads-control-icon-size-sm"] },
  // Box, type ramp, and spacing all come from ADS `EmptyState` now; only the
  // action row (a centered wrap row, not the default stacked grid) and the
  // medallion glyph size stay local.
  emptyIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  emptyActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "center",
  },
  /* Row shape, hover wash and trail live in `information-row.styles.ts`, which
     this list shares with the linked-pull-request rows above it. Only the two
     things that belong to a plan specifically stay here. */
  rowMark: { color: vars["--ads-color-text-muted"] },
  rowAction: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    blockSize: vars["--ads-icon-button-size"],
    borderRadius: vars["--ads-radius-control"],
    color: {
      default: vars["--ads-color-text-subtle"],
      ":hover": vars["--ads-color-text"],
    },
    display: "flex",
    flexShrink: 0,
    inlineSize: vars["--ads-icon-button-size"],
    justifyContent: "center",
  },
  rowActionDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-danger-soft"],
    },
    color: {
      default: vars["--ads-color-text-subtle"],
      ":focus-visible": vars["--ads-color-danger-text"],
      ":hover": vars["--ads-color-danger-text"],
    },
  },
  rowActionIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  card: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  cardContent: { paddingTop: vars["--ads-space-16"] },
});
