import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const cursorSectionStyles = stylex.create({
  field: {
    height: vars.controlHeightLg,
  },
  note: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
});
