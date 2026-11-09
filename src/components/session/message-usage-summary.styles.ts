import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

// The tooltip surface is dark (`colorText` fill, `colorTextInverted` copy), so
// its secondary text and dividers are the inverted ink at reduced alpha rather
// than a muted-on-light token.
const invertedMuted = `color-mix(in oklch, ${vars["--aui-color-text-inverted"]} 70%, transparent)`;
const invertedFaint = `color-mix(in oklch, ${vars["--aui-color-text-inverted"]} 20%, transparent)`;
const triggerMuted = vars["--aui-color-text-muted"];

export const messageUsageSummaryStyles = stylex.create({
  delegatedSection: {
    marginTop: vars["--aui-space-8"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: invertedFaint,
    paddingTop: vars["--aui-space-8"],
  },
  sectionTitle: { fontWeight: vars["--aui-font-weight-medium"] },
  mutedLine: { color: invertedMuted },
  entry: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  entryHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
  },
  entryLabel: { fontWeight: vars["--aui-font-weight-medium"] },
  entryMeta: {
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "right",
    color: invertedMuted,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars["--aui-space-12"],
    rowGap: "0.125rem",
  },
  metricLabel: { color: invertedMuted },
  metricValue: {
    textAlign: "right",
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  turnTotal: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  turnTotalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
  },
  turnTotalTitle: { fontWeight: vars["--aui-font-weight-medium"] },
  trigger: {
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars["--aui-radius-mark"],
    paddingLeft: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: 1,
    color: triggerMuted,
  },
  triggerChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.125rem",
    fontVariantNumeric: "tabular-nums",
  },
  triggerIcon: { width: 10, height: 10 },
  tooltipContent: {
    maxHeight: "20rem",
    width: "18rem",
    maxWidth: "calc(100vw - 2rem)",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
    overflowY: "auto",
  },
});
