import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const chatAreaStyles = stylex.create({
  startPanel: {
    width: "100%",
    maxWidth: "72rem",
    marginInline: "auto",
    paddingInline: vars.space12,
    paddingTop: vars.space16,
    paddingBottom: vars.space8,
    "@media (min-width: 40rem)": { paddingInline: vars.space16 },
  },
  startStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  startOptions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: vars.space8,
  },
  /**
   * Pill geometry for the starting-point row. ADS owns the control height via
   * `minBlockSize` (the shared control-metrics recipe), so the 44px touch
   * target has to restate THAT logical property — a `height`/`blockSize`
   * override is a different atomic property and would race the recipe.
   */
  startOption: {
    minBlockSize: vars.controlHeightXl,
    borderEndEndRadius: vars.radiusFull,
    borderEndStartRadius: vars.radiusFull,
    borderStartEndRadius: vars.radiusFull,
    borderStartStartRadius: vars.radiusFull,
    paddingInline: vars.space16,
    fontWeight: vars.fontWeightRegular,
    boxShadow: "none",
  },
  startOptionIcon: { width: 16, height: 16, color: vars.colorTextMuted },
  dock: { position: "relative", zIndex: vars.zIndexAppChrome, flexShrink: 0 },
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
  emptyBody: { justifyContent: "flex-end" },
  overlay: { pointerEvents: "none", position: "absolute", inset: 0 },
  buttonIcon: { width: 16, height: 16 },
  sessionArea: {
    display: "flex",
    height: "100%",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: vars.colorCanvas,
    outline: "none",
  },
});
