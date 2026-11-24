import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/*
 * Styles shared by the DOM-drawn row charts (`BulletChart`, `DumbbellChart`):
 * a label column, a track that owns the scale, a trailing readout, and the
 * tick row under them. Drawn in HTML rather than SVG because each row is a
 * line of text first — it wraps, truncates and inherits type like one.
 */
export const rowChartStyles = stylex.create({
  list: {
    display: "grid",
    gap: vars["--aui-space-12"],
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  row: {
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "minmax(72px, 140px) minmax(0, 1fr) auto",
    minInlineSize: 0,
  },
  explore: { borderRadius: vars["--aui-radius-control"] },
  rowActive: {
    backgroundColor: vars["--aui-color-overlay-hover"],
    borderRadius: vars["--aui-radius-control"],
    boxShadow: `0 0 0 4px ${vars["--aui-color-overlay-hover"]}`,
  },
  label: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sublabel: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  track: {
    blockSize: 20,
    minInlineSize: 0,
    position: "relative",
  },
  readout: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    lineHeight: vars["--aui-line-height-caption"],
    minInlineSize: "5ch",
    textAlign: "end",
    whiteSpace: "nowrap",
  },
  readoutMuted: { color: vars["--aui-color-text-muted"] },
  up: { color: vars["--aui-color-success-text"] },
  down: { color: vars["--aui-color-danger-text"] },
  ticks: {
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-12"],
    display: "grid",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    fontVariantNumeric: "tabular-nums",
    gridTemplateColumns: "minmax(72px, 140px) minmax(0, 1fr) auto",
  },
  tickTrack: { blockSize: 16, position: "relative" },
  tick: {
    insetBlockStart: 0,
    position: "absolute",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
  },
  gridLine: {
    backgroundColor: vars["--aui-color-border-subtle"],
    blockSize: "100%",
    inlineSize: 1,
    insetBlockStart: 0,
    position: "absolute",
  },
  key: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-16"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    rowGap: vars["--aui-space-4"],
  },
  keyItem: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
  },
});

/** Five evenly spaced tick values across a domain. */
export function domainTicks(
  [lo, hi]: readonly [number, number],
  count = 5,
): number[] {
  return Array.from({ length: count }, (_, index) =>
    Number((lo + ((hi - lo) * index) / (count - 1)).toPrecision(12)),
  );
}
