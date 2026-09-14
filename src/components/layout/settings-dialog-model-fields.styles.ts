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
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: {
      default: vars["--ads-color-border"],
      ":hover": vars["--ads-color-border-strong"],
    },
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    blockSize: vars["--ads-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--ads-space-12"],
    inlineSize: "100%",
  },
  menu: {
    "@media (min-width: 640px)": {
      maxInlineSize: "32rem",
    },
  },
});
