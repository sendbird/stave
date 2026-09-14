import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

// The tooltip surface is dark (`colorText` fill, `colorTextInverted` copy), so
// its secondary text and dividers are the inverted ink at reduced alpha rather
// than a muted-on-light token.
const invertedMuted = `color-mix(in oklch, ${vars["--ads-color-text-inverted"]} 70%, transparent)`;
const invertedFaint = `color-mix(in oklch, ${vars["--ads-color-text-inverted"]} 20%, transparent)`;
const triggerMuted = `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 60%, transparent)`;

export const messageUsageSummaryStyles = stylex.create({
  delegatedSection: {
    marginTop: vars["--ads-space-8"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: invertedFaint,
    paddingTop: vars["--ads-space-8"],
  },
  sectionTitle: { fontWeight: vars["--ads-font-weight-medium"] },
  mutedLine: { color: invertedMuted },
  entry: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  entryHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
  },
  entryLabel: { fontWeight: vars["--ads-font-weight-medium"] },
  entryMeta: {
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "right",
    color: invertedMuted,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars["--ads-space-12"],
    rowGap: "0.125rem",
  },
  metricLabel: { color: invertedMuted },
  metricValue: { textAlign: "right", fontFamily: vars["--ads-font-mono"] },
  turnTotal: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  turnTotalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
  },
  turnTotalTitle: { fontWeight: vars["--ads-font-weight-medium"] },
  trigger: {
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars["--ads-radius-mark"],
    paddingLeft: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
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
