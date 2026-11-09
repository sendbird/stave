import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Standalone CLI folder field row inside its settings card. */
export const standaloneCliCardStyles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  input: {
    blockSize: vars["--aui-control-height-lg"],
  },
  browse: {
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    blockSize: vars["--aui-control-height-lg"],
  },
  browseIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-8"],
  },
});
