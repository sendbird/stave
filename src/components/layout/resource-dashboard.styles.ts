import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

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
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
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
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-surface-tint"],
  },
  tileHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
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
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: "-0.01em",
    color: vars["--ads-color-text"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileCaption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileCaptionRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
  },
  trendIcon: { width: 12, height: 12, flexShrink: 0 },
  spark: { display: "block", width: "100%", height: 26, overflow: "visible" },
  sparkArea: { fill: vars["--ads-color-accent-soft"], stroke: "none" },
  sparkLine: {
    fill: "none",
    stroke: vars["--ads-color-accent"],
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
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  legendItem: { display: "inline-flex", alignItems: "baseline", gap: 4 },
  legendCount: {
    fontFamily: vars["--ads-font-mono"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text"],
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
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
  },
  meterLabelText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meterIcon: { width: 12, height: 12, flexShrink: 0 },
  meterDetail: {
    fontFamily: vars["--ads-font-mono"],
    fontVariantNumeric: "tabular-nums",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    whiteSpace: "nowrap",
  },
  track: {
    gridColumn: "1 / -1",
    height: 6,
    width: "100%",
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
  },
  fill: { height: "100%", borderRadius: vars["--ads-radius-full"] },
  sectionLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: 500,
  },
});

/** Status ramp. Never applied without an adjacent icon and word. */
export const levelFillStyles = stylex.create({
  healthy: { backgroundColor: vars["--ads-color-success"] },
  elevated: { backgroundColor: vars["--ads-color-warning"] },
  high: { backgroundColor: vars["--ads-color-danger"] },
});

export const levelTextStyles = stylex.create({
  healthy: { color: vars["--ads-color-text-muted"] },
  elevated: { color: vars["--ads-color-warning-text"] },
  high: { color: vars["--ads-color-danger-text"] },
});

/** Magnitude, not identity: one hue for every share bar in the dialog. */
export const shareStyles = stylex.create({
  track: {
    height: 4,
    width: "100%",
    minWidth: 48,
    marginBlockStart: 6,
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
  },
  fill: {
    height: "100%",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-accent"],
  },
});
