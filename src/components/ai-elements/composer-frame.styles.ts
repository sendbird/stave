import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Measured composer tracks and tuck are host geometry, not control density.
 *
 * The tuck itself (`-0.75rem` overlaps, the `3.125rem` track, the `50px` status
 * floor) stays a literal: it is a measured overlap between two surfaces, not a
 * rhythm step.
 *
 * Every bar shows one 38px band beyond the card: 2px of air at its outer edge,
 * a 32px control row, and 4px that keeps the card's 3px focus ring off the
 * row. The top shelf draws the same band in `composer-shelf.styles.ts`. A wing
 * is that band plus the tuck (50px), in a track that also leaves 12px outside. Everything that IS rhythm — the gaps between chips in a wing,
 * the status row's gutters — is on the space scale, because a `6px`/`10px` gap
 * beside `space8` controls is a rung nothing else in the composer uses.
 */
export const frameStyles = stylex.create({
  frame: { isolation: "isolate", display: "grid", alignItems: "stretch", gridTemplateColumns: "minmax(0, 1fr)" },
  withWings: { gridTemplateColumns: "3.125rem minmax(0, 1fr) 3.125rem" },
  cardColumn: { gridColumnStart: 1 },
  wingCardColumn: { gridColumnStart: 2 },
  top: { position: "relative", zIndex: 0, gridRowStart: 1, marginBottom: "-0.75rem", minWidth: 0, marginInline: "0.75rem" },
  bottom: { position: "relative", zIndex: 0, gridRowStart: 3, marginTop: "-0.75rem", minWidth: 0, marginInline: "0.75rem" },
  track: { position: "relative", zIndex: 0, gridRowStart: 2, minHeight: 0, alignSelf: "stretch", width: "3.125rem", minWidth: "3.125rem" },
  leftTrack: { gridColumnStart: 1 },
  rightTrack: { gridColumnStart: 3 },
  leftInset: { position: "absolute", left: 0, right: "-0.75rem", insetBlock: "0.75rem", display: "flex", justifyContent: "flex-end" },
  rightInset: { position: "absolute", left: "-0.75rem", right: 0, insetBlock: "0.75rem", display: "flex", justifyContent: "flex-start" },
  card: { position: "relative", zIndex: 10, gridRowStart: 2, minWidth: 0 },
  wing: { display: "flex", height: "100%", maxHeight: "100%", minHeight: 0, flexShrink: 0, flexDirection: "column", gap: vars["--ads-space-8"], overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", paddingBlock: vars["--ads-space-8"], justifyContent: "safe center", scrollbarWidth: "none" },
  leftWing: { alignItems: "flex-end", paddingLeft: vars["--ads-space-2"], paddingRight: "calc(0.75rem + 4px)" },
  rightWing: { alignItems: "flex-start", paddingLeft: "calc(0.75rem + 4px)", paddingRight: vars["--ads-space-2"] },
  status: { display: "flex", minHeight: 50, alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-8"], overflow: "hidden", borderBottomLeftRadius: vars["--ads-radius-panel"], borderBottomRightRadius: vars["--ads-radius-panel"], borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingInline: vars["--ads-space-12"], paddingBottom: vars["--ads-space-2"], paddingTop: "calc(0.75rem + 4px)", fontSize: "0.8125rem", lineHeight: "20px", color: vars["--ads-color-text-muted"] },
  leading: { display: "flex", minWidth: 0, alignItems: "center", gap: vars["--ads-space-8"] },
  trailing: { display: "flex", flexShrink: 0, alignItems: "center", gap: vars["--ads-space-4"] },
});
