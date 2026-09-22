import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";
import type { GraphRefType } from "@/lib/git-graph/types";

/**
 * Commit-graph rows sit on the Monaco editor surface (`--editor*`), so those
 * grounds stay as theme CSS variables while every border, text, and semantic
 * accent resolves to an ADS token. Row selection/hover reuse the accent tint
 * ramp (`colorSelectionFill`) the rest of the app uses for selected list rows.
 */
export const gitGraphRowStyles = stylex.create({
  row: {
    display: "grid",
    cursor: "default",
    userSelect: "none",
    alignItems: "center",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 30%, transparent)`,
    fontSize: vars["--ads-font-size-caption"],
    // No `outline: none` here. Both row variants are focusable (`role="row"`
    // with a roving `tabIndex`) and both already compose
    // `focusRing.ring` + `focusRing.ringInset` at the call site in
    // `GitGraphRow.tsx`; the shorthand suppressed the whole outline group and
    // raced the recipe's longhands for the keyboard indicator. The recipe's own
    // `outlineStyle: none` default is what makes the resting state ring-less.
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 35%, transparent)`,
    },
  },
  rowSelected: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 65%, transparent)`,
    },
    color: vars["--ads-color-text"],
  },
  rowSearchMatch: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-warning"]} 8%, transparent)`,
  },
  workingTreeRow: {
    display: "grid",
    cursor: "default",
    userSelect: "none",
    alignItems: "center",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 45%, transparent)`,
    backgroundColor: {
      default: "color-mix(in oklch, var(--editor-muted) 35%, transparent)",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 35%, transparent)`,
    },
    fontSize: vars["--ads-font-size-caption"],
  },
  workingTreeRowSelected: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-selection-fill"]} 65%, transparent)`,
    },
  },
  leadCell: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingRight: vars["--ads-space-12"],
  },
  workingTreeLeadCell: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingRight: vars["--ads-space-12"],
  },
  laneSpacer: {
    flexShrink: 0,
  },
  subject: {
    minWidth: "5rem",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  workingTreeLabel: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  workingTreeBadge: {
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: 6,
    paddingBlock: 2,
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  workingTreeConflicts: {
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-danger-text"],
  },
  refList: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  cell: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 25%, transparent)`,
    paddingInline: 10,
    color: vars["--ads-color-text-muted"],
  },
  cellDate: {
    fontVariantNumeric: "tabular-nums",
  },
  cellHash: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
  },
  emptyCell: {
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 25%, transparent)`,
    paddingInline: 10,
  },
  highlightMark: {
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-warning"]} 30%, transparent)`,
    paddingInline: 2,
    color: "inherit",
  },
  refLabel: {
    display: "inline-flex",
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-4"],
    whiteSpace: "nowrap",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: 6,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: 1,
  },
  refHead: {
    boxShadow: `0 0 0 1px color-mix(in oklch, ${vars["--ads-color-accent"]} 30%, transparent)`,
  },
  refIcon: {
    width: 10,
    height: 10,
  },
  refHeadTag: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  refHead_head: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 12%, transparent)`,
    color: vars["--ads-color-accent"],
  },
  refHead_localBranch: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-success-border"]} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-success"]} 10%, transparent)`,
    color: vars["--ads-color-success-text"],
  },
  refHead_remoteBranch: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-info-border"]} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-info"]} 10%, transparent)`,
    color: vars["--ads-color-info-text"],
  },
  refHead_tag: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-warning-border"]} 40%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-warning"]} 12%, transparent)`,
    color: vars["--ads-color-warning-text"],
  },
});

export const gitGraphRefTypeStyles = {
  head: gitGraphRowStyles.refHead_head,
  localBranch: gitGraphRowStyles.refHead_localBranch,
  remoteBranch: gitGraphRowStyles.refHead_remoteBranch,
  tag: gitGraphRowStyles.refHead_tag,
} as const satisfies Record<GraphRefType, unknown>;
