import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/*
 * The track is a pill-shaped well in the ink's 6% wash, so it sits on the
 * composer shelf, a card or the Task panel without its own surface. The head
 * label is a chip on the card surface, ringed in the tone, the same height as
 * the track so it never overhangs it: the radii are concentric by being equal.
 */
export const ditherProgressStyles = stylex.create({
  root: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  track: {
    position: "relative",
    flex: "1 1 auto",
    minWidth: 0,
    height: 16,
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-overlay-hover"],
  },
  trackMd: { height: 20 },
  canvas: { position: "absolute", inset: 0, display: "block", width: "100%", height: "100%" },
  head: {
    position: "absolute",
    top: 0,
    left: 0,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    height: "100%",
    // The rest of the track keeps showing the run, however long the stage's name.
    maxWidth: "60%",
    paddingInline: 6,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-surface"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  headMd: { gap: vars["--ads-space-4"], paddingInline: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"] },
  label: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontWeight: vars["--ads-font-weight-medium"] },
  count: { flex: "0 0 auto", color: vars["--ads-color-text-muted"], fontVariantNumeric: "tabular-nums" },
  mark: { flex: "0 0 auto", width: 10, height: 10 },
  markMd: { width: 12, height: 12 },
  percent: {
    flex: "0 0 auto",
    // "100%" is the widest value; the track does not shift as the number grows.
    minWidth: "4ch",
    textAlign: "end",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
});

const ring = (color: string) => `inset 0 0 0 1px ${color}`;

export const HEAD_TONES = stylex.create({
  active: { boxShadow: ring(vars["--ads-color-accent"]) },
  waiting: { boxShadow: ring(vars["--ads-color-warning-border"]) },
  attention: { boxShadow: ring(vars["--ads-color-danger-border"]) },
  done: { boxShadow: ring(vars["--ads-color-success-border"]) },
  idle: { boxShadow: ring(vars["--ads-color-border"]) },
  skipped: { boxShadow: ring(vars["--ads-color-border"]), color: vars["--ads-color-text-muted"] },
});

export const MARK_TONES = stylex.create({
  waiting: { color: vars["--ads-color-warning-text"] },
  attention: { color: vars["--ads-color-danger-text"] },
  done: { color: vars["--ads-color-success-text"] },
});
