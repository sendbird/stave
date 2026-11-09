import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The Resource Manager's dashboard header.
 *
 * Two rules hold the color budget together here. Status hues (success /
 * warning / danger) appear only on readings that have a real denominator or a
 * threshold that means something on its own, and every one of them is paired
 * with an icon and a word so the state survives a colorblind reader, a
 * grayscale screenshot and forced-colors mode. Everything else — the trend
 * strip, the share bars — is one neutral accent hue, because those encode
 * magnitude, and a hue that varies with size double-encodes the length the
 * reader is already looking at.
 */
export const dashboardStyles = stylex.create({
  root: {
    display: "grid",
    gap: 10,
  },
  statusBand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  },
  statusReason: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusSpacer: { marginInlineStart: "auto" },
  badgeIcon: { width: 12, height: 12 },
  /**
   * `auto-fit` rather than a fixed four: the dialog is viewport-clamped, so on
   * a narrow window the tiles reflow to two rows instead of crushing the value
   * text to two characters per line.
   */
  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))",
    gap: 8,
  },
  tile: {
    display: "grid",
    gap: 4,
    alignContent: "start",
    minWidth: 0,
    padding: 10,
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: vars["--aui-color-surface-tint"],
  },
  tileHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  tileIcon: { width: 13, height: 13, flexShrink: 0 },
  tileLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * Proportional figures on purpose: tabular digits are for columns that align
   * vertically, and at display size they make a short number look gappy. The
   * mono/tabular treatment stays on the tables below, where it earns its keep.
   */
  tileValue: {
    fontSize: vars["--aui-font-size-heading"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-heading"],
    letterSpacing: "-0.01em",
    color: vars["--aui-color-text"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileCaption: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileCaptionRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
  },
  trendIcon: { width: 12, height: 12, flexShrink: 0 },
  spark: { display: "block", width: "100%", height: 26, overflow: "visible" },
  sparkArea: { fill: vars["--aui-color-accent-soft"], stroke: "none" },
  sparkLine: {
    fill: "none",
    stroke: vars["--aui-color-accent"],
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  legendItem: { display: "inline-flex", alignItems: "baseline", gap: 4 },
  legendCount: {
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text"],
  },
  meters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
    gap: 10,
    columnGap: 16,
    alignItems: "start",
  },
  metersLabel: { gridColumn: "1 / -1" },
  meterRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: 10,
    rowGap: 5,
  },
  meterLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  meterLabelText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meterIcon: { width: 12, height: 12, flexShrink: 0 },
  meterDetail: {
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    whiteSpace: "nowrap",
  },
  /** The AUI meter spans the row under its label and reading. */
  meter: { gridColumn: "1 / -1" },
  sectionLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: 500,
  },
});

/** Status ink. Never applied without an adjacent icon and word. */
export const levelTextStyles = stylex.create({
  healthy: { color: vars["--aui-color-text-muted"] },
  elevated: { color: vars["--aui-color-warning-text"] },
  high: { color: vars["--aui-color-danger-text"] },
});
