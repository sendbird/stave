import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const chatPanelMessagePartsStyles = stylex.create({
  copyIcon: { width: 14, height: 14 },
  copyIconActive: { width: 14, height: 14, color: vars.colorAccent },
  systemEventText: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: "0.875em",
    fontStyle: "italic",
    color: vars.colorTextMuted,
  },
});
