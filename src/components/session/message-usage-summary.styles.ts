import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

// The tooltip surface is dark (`colorText` fill, `colorTextInverted` copy), so
// its secondary text and dividers are the inverted ink at reduced alpha rather
// than a muted-on-light token.
const invertedMuted = `color-mix(in oklch, ${vars.colorTextInverted} 70%, transparent)`;
const invertedFaint = `color-mix(in oklch, ${vars.colorTextInverted} 20%, transparent)`;
const triggerMuted = `color-mix(in oklch, ${vars.colorTextMuted} 60%, transparent)`;

export const messageUsageSummaryStyles = stylex.create({
  delegatedSection: {
    marginTop: vars.space8,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: invertedFaint,
    paddingTop: vars.space8,
  },
  sectionTitle: { fontWeight: vars.fontWeightMedium },
  mutedLine: { color: invertedMuted },
  entry: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  entryHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.space12,
  },
  entryLabel: { fontWeight: vars.fontWeightMedium },
  entryMeta: {
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "right",
    color: invertedMuted,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars.space12,
    rowGap: "0.125rem",
  },
  metricLabel: { color: invertedMuted },
  metricValue: { textAlign: "right", fontFamily: vars.fontMono },
  turnTotal: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  turnTotalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.space12,
  },
  turnTotalTitle: { fontWeight: vars.fontWeightMedium },
  trigger: {
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars.radiusMark,
    paddingLeft: vars.space4,
    fontSize: vars.fontSizeMicro,
    lineHeight: 1,
    color: triggerMuted,
  },
  triggerChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.125rem",
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
