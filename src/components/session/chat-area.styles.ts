import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const chatAreaStyles = stylex.create({
  startPanel: {
    width: "100%",
    maxWidth: "72rem",
    marginInline: "auto",
    paddingInline: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-16"],
    paddingBottom: 0,
    "@media (min-width: 40rem)": { paddingInline: vars["--ads-space-16"] },
  },
  startStack: {
    display: "flex",
    flexDirection: "column",
    // Inter-group gap: the shared-instructions action and the chip row are
    // separate clusters. space8 matches the chip row's *internal* rhythm and
    // glued the outline button to the pills.
    gap: vars["--ads-space-16"],
  },
  startOptions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: vars["--ads-space-8"],
  },
  /**
   * Pill geometry for the starting-point row. ADS owns the control height via
   * `minBlockSize` (the shared control-metrics recipe), so the 44px touch
   * target has to restate THAT logical property — a `height`/`blockSize`
   * override is a different atomic property and would race the recipe.
   */
  startOption: {
    minBlockSize: vars["--ads-control-height-xl"],
    borderEndEndRadius: vars["--ads-radius-full"],
    borderEndStartRadius: vars["--ads-radius-full"],
    borderStartEndRadius: vars["--ads-radius-full"],
    borderStartStartRadius: vars["--ads-radius-full"],
    paddingInline: vars["--ads-space-16"],
    fontWeight: vars["--ads-font-weight-regular"],
    boxShadow: "none",
  },
  startOptionIcon: { width: 16, height: 16, color: vars["--ads-color-text-muted"] },
  dock: { position: "relative", zIndex: vars["--ads-z-index-app-chrome"], flexShrink: 0 },
  scrollColumn: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
    overflowY: "auto",
  },
  centeredColumn: {
    display: "flex",
    width: "100%",
    maxWidth: "72rem",
    flex: 1,
    flexDirection: "column",
    marginInline: "auto",
  },
  surface: {
    position: "relative",
    display: "flex",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
  },
  emptyBody: {
    justifyContent: "flex-end",
    // Keep the first-prompt cluster near the composer, but not flush against it.
    paddingBottom: vars["--ads-space-24"],
  },
  overlay: { pointerEvents: "none", position: "absolute", inset: 0 },
  buttonIcon: { width: 16, height: 16 },
  sessionArea: {
    display: "flex",
    height: "100%",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: vars["--ads-color-canvas"],
    outline: "none",
  },
});
