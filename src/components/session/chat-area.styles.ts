import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const chatAreaStyles = stylex.create({
  startPanel: {
    width: "100%",
    maxWidth: "72rem",
    marginInline: "auto",
    paddingInline: vars["--aui-space-12"],
    paddingTop: vars["--aui-space-16"],
    paddingBottom: 0,
    "@media (min-width: 40rem)": { paddingInline: vars["--aui-space-16"] },
  },
  startStack: {
    display: "flex",
    flexDirection: "column",
    // Inter-group gap: the shared-instructions action and the chip row are
    // separate clusters. space8 matches the chip row's *internal* rhythm and
    // glued the outline button to the pills.
    gap: vars["--aui-space-16"],
  },
  startOptions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: vars["--aui-space-8"],
  },
  /**
   * Pill geometry for the starting-point row. AUI owns the control height via
   * `minBlockSize` (the shared control-metrics recipe), so the 44px touch
   * target has to restate THAT logical property — a `height`/`blockSize`
   * override is a different atomic property and would race the recipe.
   */
  startOption: {
    minBlockSize: vars["--aui-control-height-xl"],
    borderEndEndRadius: vars["--aui-radius-full"],
    borderEndStartRadius: vars["--aui-radius-full"],
    borderStartEndRadius: vars["--aui-radius-full"],
    borderStartStartRadius: vars["--aui-radius-full"],
    paddingInline: vars["--aui-space-16"],
    fontWeight: vars["--aui-font-weight-regular"],
    boxShadow: "none",
  },
  startOptionIcon: { width: 16, height: 16, color: vars["--aui-color-text-muted"] },
  dock: { position: "relative", zIndex: vars["--aui-z-index-app-chrome"], flexShrink: 0 },
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
    paddingBottom: vars["--aui-space-24"],
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
    backgroundColor: vars["--aui-color-canvas"],
    outline: "none",
  },
});
