import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnActivityPanelStyles = stylex.create({
  scrollColumn: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflowY: "auto",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  placeholder: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    padding: vars.space12,
  },
  placeholderText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
