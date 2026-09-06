import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const sliderLayout = stylex.create({
  root: {
    width: { default: null, ':is([data-orientation="horizontal"])': "100%" },
    height: { default: null, ':is([data-orientation="vertical"])': "100%" },
  },
  control: {
    position: "relative", display: "flex", touchAction: "none", alignItems: "center", userSelect: "none",
    height: { default: 28, ':is([data-orientation="vertical"])': "100%" },
    width: { default: "100%", ':is([data-orientation="vertical"])': 28 },
    minHeight: { default: null, ':is([data-orientation="vertical"])': 160 },
    flexDirection: { default: "row", ':is([data-orientation="vertical"])': "column" },
    opacity: { default: 1, ':is([data-disabled]):not([data-disabled="false"])': vars.opacityDisabled },
  },
  track: {
    position: "relative", flexGrow: 1, userSelect: "none",
    height: { default: 6, ':is([data-orientation="vertical"])': "100%" },
    width: { default: "100%", ':is([data-orientation="vertical"])': 6 },
  },
  indicator: {
    userSelect: "none",
    height: { default: "100%", ':is([data-orientation="vertical"])': null },
    width: { default: null, ':is([data-orientation="vertical"])': "100%" },
  },
});
