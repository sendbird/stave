import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Measured composer tracks and tuck are host geometry, not control density.
 *
 * The tuck itself (`-0.75rem` overlaps, the `3.75rem` track, the `52px` status
 * floor) stays a literal: it is a measured overlap between two surfaces, not a
 * rhythm step. Everything that IS rhythm — the gaps between chips in a wing,
 * the status row's gutters — is on the space scale, because a `6px`/`10px` gap
 * beside `space8` controls is a rung nothing else in the composer uses.
 */
export const frameStyles = stylex.create({
  frame: { isolation: "isolate", display: "grid", alignItems: "stretch", gridTemplateColumns: "minmax(0, 1fr)" },
  withWings: { gridTemplateColumns: "3.75rem minmax(0, 1fr) 3.75rem" },
  cardColumn: { gridColumnStart: 1 },
  wingCardColumn: { gridColumnStart: 2 },
  top: { position: "relative", zIndex: 0, gridRowStart: 1, marginBottom: "-0.75rem", minWidth: 0, marginInline: "0.75rem" },
  bottom: { position: "relative", zIndex: 0, gridRowStart: 3, marginTop: "-0.75rem", minWidth: 0, marginInline: "0.75rem" },
  track: { position: "relative", zIndex: 0, gridRowStart: 2, minHeight: 0, alignSelf: "stretch", width: "3.75rem", minWidth: "3.75rem" },
  leftTrack: { gridColumnStart: 1 },
  rightTrack: { gridColumnStart: 3 },
  leftInset: { position: "absolute", left: 0, right: "-0.75rem", insetBlock: "0.75rem", display: "flex", justifyContent: "flex-end" },
  rightInset: { position: "absolute", left: "-0.75rem", right: 0, insetBlock: "0.75rem", display: "flex", justifyContent: "flex-start" },
  card: { position: "relative", zIndex: 10, gridRowStart: 2, minWidth: 0 },
  wing: { display: "flex", height: "100%", maxHeight: "100%", minHeight: 0, flexShrink: 0, flexDirection: "column", gap: vars["--ads-space-8"], overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", paddingBlock: vars["--ads-space-8"], justifyContent: "safe center", scrollbarWidth: "none" },
  leftWing: { alignItems: "flex-end", paddingLeft: vars["--ads-space-8"], paddingRight: vars["--ads-space-20"] },
  rightWing: { alignItems: "flex-start", paddingLeft: vars["--ads-space-20"], paddingRight: vars["--ads-space-8"] },
  status: { display: "flex", minHeight: 52, alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-8"], overflow: "hidden", borderBottomLeftRadius: vars["--ads-radius-panel"], borderBottomRightRadius: vars["--ads-radius-panel"], borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingInline: vars["--ads-space-12"], paddingBottom: vars["--ads-space-12"], paddingTop: vars["--ads-space-24"], fontSize: "0.8125rem", lineHeight: "20px", color: vars["--ads-color-text-muted"] },
  leading: { display: "flex", minWidth: 0, alignItems: "center", gap: vars["--ads-space-8"] },
  trailing: { display: "flex", flexShrink: 0, alignItems: "center", gap: vars["--ads-space-4"] },
});
