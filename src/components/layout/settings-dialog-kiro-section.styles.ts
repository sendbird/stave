import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const kiroSectionStyles = stylex.create({
  field: {
    blockSize: vars["--ads-control-height-lg"],
  },
  note: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
});
