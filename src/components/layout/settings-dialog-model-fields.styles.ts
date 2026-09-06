import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Prompt/aux model selector field inside the Settings sections. */
export const modelFieldsStyles = stylex.create({
  selector: {
    width: "100%",
  },
  trigger: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: vars.controlHeightLg,
    maxWidth: "none",
    paddingInline: vars.space12,
    width: "100%",
  },
  menu: {
    "@media (min-width: 640px)": {
      maxWidth: "32rem",
    },
  },
});
