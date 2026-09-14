import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Standalone CLI folder field row inside its settings card. */
export const standaloneCliCardStyles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  input: {
    blockSize: vars["--ads-control-height-lg"],
  },
  browse: {
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    blockSize: vars["--ads-control-height-lg"],
  },
  browseIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  error: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-8"],
  },
});
