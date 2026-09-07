import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const kiroSectionStyles = stylex.create({
  field: {
    blockSize: vars.controlHeightLg,
  },
  note: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
});
