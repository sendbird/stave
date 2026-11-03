import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnTraceTimelineStyles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  note: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  empty: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  slowest: {
    fontFamily: vars["--ads-font-sans"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-warning-text"],
  },
  cost: {
    color: vars["--ads-color-text"],
  },
  unreported: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  unreportedHeading: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text-muted"],
  },
  unreportedList: {
    display: "grid",
    gap: vars["--ads-space-2"],
    margin: 0,
    padding: 0,
    listStyle: "none",
    minWidth: 0,
  },
  unreportedItem: {
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  unreportedLabel: { flexShrink: 0 },
  unreportedDetail: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--ads-color-text-muted"],
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  swatch: {
    flexShrink: 0,
    width: vars["--ads-space-8"],
    height: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-mark"],
  },
  swatchLine: {
    width: vars["--ads-border-width-hairline"],
    height: vars["--ads-space-12"],
    borderRadius: 0,
    backgroundColor: vars["--ads-color-info"],
  },
  turn: { backgroundColor: vars["--ads-color-text-subtle"] },
  model: { backgroundColor: vars["--ads-chart-4"] },
  tool: { backgroundColor: vars["--ads-chart-1"] },
  agent: { backgroundColor: vars["--ads-chart-2"] },
});
