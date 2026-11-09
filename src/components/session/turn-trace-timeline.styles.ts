import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const turnTraceTimelineStyles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  note: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  empty: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  slowest: {
    fontFamily: vars["--aui-font-sans"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-warning-text"],
  },
  cost: {
    color: vars["--aui-color-text"],
  },
  unreported: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  unreportedHeading: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text-muted"],
  },
  unreportedList: {
    display: "grid",
    gap: vars["--aui-space-2"],
    margin: 0,
    padding: 0,
    listStyle: "none",
    minWidth: 0,
  },
  unreportedItem: {
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
  },
  unreportedLabel: { flexShrink: 0 },
  unreportedDetail: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--aui-color-text-muted"],
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  swatch: {
    flexShrink: 0,
    width: vars["--aui-space-8"],
    height: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-mark"],
  },
  swatchLine: {
    width: vars["--aui-border-width-hairline"],
    height: vars["--aui-space-12"],
    borderRadius: 0,
    backgroundColor: vars["--aui-color-info"],
  },
  turn: { backgroundColor: vars["--aui-color-text-subtle"] },
  model: { backgroundColor: vars["--aui-chart-4"] },
  tool: { backgroundColor: vars["--aui-chart-1"] },
  agent: { backgroundColor: vars["--aui-chart-2"] },
});
