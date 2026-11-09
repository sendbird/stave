import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Provider mark shown in the Background AI provider choice buttons. */
export const auxiliaryInferenceSectionStyles = stylex.create({
  providerIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
});
