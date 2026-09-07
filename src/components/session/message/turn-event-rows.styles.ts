import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnEventRowStyles = stylex.create({
  output: {
    display: "grid",
    gap: vars.space4,
    justifyItems: "start",
    minInlineSize: 0,
  },
  /**
   * Provider output in the machine register. `pre-wrap` keeps the tool's own
   * line breaks; `overflow-wrap: anywhere` stops one long path from setting a
   * min-content width wider than the disclosure that holds it.
   */
  outputText: {
    color: vars.colorText,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontVariantLigatures: "none",
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  outputProse: {
    fontFamily: vars.fontSans,
  },
  copy: {
    justifySelf: "end",
  },
  /** The reasoning body: prose, secondary ink, relaxed leading. */
  reasoningBody: {
    color: vars.colorTextMuted,
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  progressList: {
    display: "grid",
    gap: vars.space4,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  progressItem: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
});
