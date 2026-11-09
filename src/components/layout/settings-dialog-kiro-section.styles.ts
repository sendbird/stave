import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const kiroSectionStyles = stylex.create({
  field: {
    blockSize: vars["--aui-control-height-lg"],
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
});
