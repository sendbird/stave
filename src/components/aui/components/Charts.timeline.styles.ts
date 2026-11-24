import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/** TimelineChart (bars variant) stylesheet — split from Charts.timeline.tsx. */
export const styles = stylex.create({
  body: { display: "grid", gap: vars["--aui-space-8"], minInlineSize: 0 },
  grid: {
    borderRadius: vars["--aui-radius-control"],
    display: "grid",
    rowGap: vars["--aui-space-4"],
  },
  row: { display: "contents" },
  rowLabel: {
    alignSelf: "center",
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    overflow: "hidden",
    paddingInlineEnd: vars["--aui-space-8"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  track: { blockSize: 24, minInlineSize: 0, position: "relative" },
  bar: {
    alignItems: "center",
    blockSize: 18,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--aui-rail-width"],
    borderRadius: 2,
    boxSizing: "border-box",
    display: "flex",
    insetBlockStart: 3,
    overflow: "hidden",
    position: "absolute",
    // Above the now rule: the rule shows in the gaps between bars and never
    // strikes through a bar's label.
    // layer-ok: orders a bar over the chart's own now rule only
    zIndex: 1,
  },
  clickable: { cursor: "pointer" },
  progress: {
    blockSize: "100%",
    insetInlineStart: 0,
    opacity: 0.55,
    position: "absolute",
  },
  barLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: vars["--aui-line-height-caption"],
    overflow: "hidden",
    paddingInline: vars["--aui-space-4"],
    position: "relative",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // On `timeAxisStyles.nowRule`: the bars' rule is a 1.5px danger line that
  // overshoots the row by 2px each side.
  now: {
    backgroundColor: vars["--aui-color-danger"],
    blockSize: "calc(100% + 4px)",
    inlineSize: 1.5,
    insetBlockStart: -2,
  },
  ticks: {
    blockSize: 16,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: vars["--aui-line-height-caption"],
    position: "relative",
  },
  tick: { position: "absolute", whiteSpace: "nowrap" },
  footer: {
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    justifyContent: "space-between",
    lineHeight: vars["--aui-line-height-caption"],
    minBlockSize: vars["--aui-control-icon-size-lg"],
  },
  readout: {
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
  },
  legend: {
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
  },
  legendItem: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
  },
  swatch: { blockSize: 10, borderRadius: 2, inlineSize: 10 },
});
