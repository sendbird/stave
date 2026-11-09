import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const chatPanelMessagePartsStyles = stylex.create({
  copyIcon: { width: 14, height: 14 },
  copyIconActive: { width: 14, height: 14, color: vars["--aui-color-accent"] },
  systemEventText: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: "0.875em",
    fontStyle: "italic",
    color: vars["--aui-color-text-muted"],
  },
});
