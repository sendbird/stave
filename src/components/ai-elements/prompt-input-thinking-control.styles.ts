import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const thinkingControlStyles = stylex.create({
  // Wide enough for each mode's one-line description beside its name.
  content: {
    inlineSize: 320,
  },
  // Says the choice is the Claude setting every task shares, not this task's.
  scope: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
    paddingBlockEnd: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  item: {
    alignItems: "flex-start",
  },
  itemBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
  },
  itemDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "normal",
  },
});
