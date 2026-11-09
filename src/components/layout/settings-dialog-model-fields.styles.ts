import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Prompt/aux model selector field inside the Settings sections. */
export const modelFieldsStyles = stylex.create({
  selector: {
    inlineSize: "100%",
  },
  trigger: {
    // Field fill, not canvas: `colorSurfaceRaised` is what every AUI field
    // paints, so the trigger keeps a lifted tone under themes whose canvas and
    // card collapse to the same value. Hover strengthens the border only, the
    // same contract as `InputGroup`.
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: {
      default: vars["--aui-color-border"],
      ":hover": vars["--aui-color-border-strong"],
    },
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    blockSize: vars["--aui-control-height-lg"],
    maxInlineSize: "none",
    paddingInline: vars["--aui-space-12"],
    inlineSize: "100%",
  },
  menu: {
    "@media (min-width: 640px)": {
      maxInlineSize: "32rem",
    },
  },
});
