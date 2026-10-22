import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const thinkingControlStyles = stylex.create({
  // Wide enough for each mode's one-line description beside its name.
  content: {
    inlineSize: 320,
  },
  // Says the choice is the Claude setting every task shares, not this task's.
  scope: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
    paddingBlockEnd: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  item: {
    alignItems: "flex-start",
  },
  itemBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minInlineSize: 0,
  },
  itemDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    whiteSpace: "normal",
  },
});
