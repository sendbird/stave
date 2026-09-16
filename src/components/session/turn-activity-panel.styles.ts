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
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    padding: vars["--ads-space-12"],
  },
  placeholderText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
  },
  body: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
});
