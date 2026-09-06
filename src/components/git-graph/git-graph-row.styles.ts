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
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 30%, transparent)`,
    fontSize: vars.fontSizeCaption,
    outline: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars.colorSelectionFill} 35%, transparent)`,
    },
  },
  rowSelected: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars.colorSelectionFill} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars.colorSelectionFill} 65%, transparent)`,
    },
    color: vars.colorText,
  },
  rowSearchMatch: {
    backgroundColor: `color-mix(in oklch, ${vars.colorWarning} 8%, transparent)`,
  },
  workingTreeRow: {
    display: "grid",
    cursor: "default",
    userSelect: "none",
    alignItems: "center",
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 45%, transparent)`,
    backgroundColor: {
      default: "color-mix(in oklch, var(--editor-muted) 35%, transparent)",
      ":hover": `color-mix(in oklch, ${vars.colorSelectionFill} 35%, transparent)`,
    },
    fontSize: vars.fontSizeCaption,
    outline: "none",
  },
  workingTreeRowSelected: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars.colorSelectionFill} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars.colorSelectionFill} 65%, transparent)`,
    },
  },
  leadCell: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingRight: vars.space12,
  },
  workingTreeLeadCell: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars.space8,
    paddingRight: vars.space12,
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
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  workingTreeLabel: {
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  workingTreeBadge: {
    borderRadius: vars.radiusMark,
    backgroundColor: vars.colorCanvasSubtle,
    paddingInline: 6,
    paddingBlock: 2,
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  workingTreeConflicts: {
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorDanger,
  },
  refList: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space4,
  },
  cell: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars.colorBorder} 25%, transparent)`,
    paddingInline: 10,
    color: vars.colorTextMuted,
  },
  cellDate: {
    fontVariantNumeric: "tabular-nums",
  },
  cellHash: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
  },
  emptyCell: {
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars.colorBorder} 25%, transparent)`,
    paddingInline: 10,
  },
  highlightMark: {
    borderRadius: vars.radiusMark,
    backgroundColor: `color-mix(in oklch, ${vars.colorWarning} 30%, transparent)`,
    paddingInline: 2,
    color: "inherit",
  },
  refLabel: {
    display: "inline-flex",
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space4,
    whiteSpace: "nowrap",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: 6,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
  },
  refHead: {
    boxShadow: `0 0 0 1px color-mix(in oklch, ${vars.colorAccent} 30%, transparent)`,
  },
  refIcon: {
    width: 10,
    height: 10,
  },
  refHeadTag: {
    fontSize: 8,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  refHead_head: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 12%, transparent)`,
    color: vars.colorAccent,
  },
  refHead_localBranch: {
    borderColor: `color-mix(in oklch, ${vars.colorSuccessBorder} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorSuccess} 10%, transparent)`,
    color: vars.colorSuccessText,
  },
  refHead_remoteBranch: {
    borderColor: `color-mix(in oklch, ${vars.colorInfoBorder} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorInfo} 10%, transparent)`,
    color: vars.colorInfoText,
  },
  refHead_tag: {
    borderColor: `color-mix(in oklch, ${vars.colorWarningBorder} 40%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorWarning} 12%, transparent)`,
    color: vars.colorWarningText,
  },
});

export const gitGraphRefTypeStyles = {
  head: gitGraphRowStyles.refHead_head,
  localBranch: gitGraphRowStyles.refHead_localBranch,
  remoteBranch: gitGraphRowStyles.refHead_remoteBranch,
  tag: gitGraphRowStyles.refHead_tag,
} as const satisfies Record<GraphRefType, unknown>;
