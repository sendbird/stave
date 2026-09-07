import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Prompt/aux model selector field inside the Settings sections. */
export const modelFieldsStyles = stylex.create({
  selector: {
    inlineSize: "100%",
  },
  trigger: {
    // Field fill, not canvas: `colorSurfaceRaised` is what every ADS field
    // paints, so the trigger keeps a lifted tone under themes whose canvas and
    // card collapse to the same value. Hover strengthens the border only, the
    // same contract as `InputGroup`.
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorBorderStrong,
    },
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    blockSize: vars.controlHeightLg,
    maxInlineSize: "none",
    paddingInline: vars.space12,
    inlineSize: "100%",
  },
  menu: {
    "@media (min-width: 640px)": {
      maxInlineSize: "32rem",
    },
  },
});
