import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const macroControlStyles = stylex.create({
  content: {
    inlineSize: "20rem",
  },
  // The list's heading, above its search row, inset like the rows below it.
  label: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-8"],
    margin: 0,
    paddingBlockStart: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  labelIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
});
