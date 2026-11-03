import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const macroControlStyles = stylex.create({
  content: {
    inlineSize: "20rem",
  },
  // The list's heading, above its search row, inset like the rows below it.
  label: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    margin: 0,
    paddingBlockStart: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  labelIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
