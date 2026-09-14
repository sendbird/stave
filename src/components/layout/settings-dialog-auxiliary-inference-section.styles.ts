import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Provider mark shown in the Background AI provider choice buttons. */
export const auxiliaryInferenceSectionStyles = stylex.create({
  providerIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
