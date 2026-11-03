import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnEventRowStyles = stylex.create({
  output: {
    display: "grid",
    gap: vars["--ads-space-4"],
    justifyItems: "start",
    minInlineSize: 0,
  },
  /**
   * Provider output in the machine register. `pre-wrap` keeps the tool's own
   * line breaks; `overflow-wrap: anywhere` stops one long path from setting a
   * min-content width wider than the disclosure that holds it.
   */
  outputText: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantLigatures: "none",
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  outputProse: {
    fontFamily: vars["--ads-font-sans"],
  },
  /* The capped box takes the section's width, so the cut and its fade run
     edge to edge whatever the longest line measures. */
  capped: {
    justifySelf: "stretch",
    minInlineSize: 0,
  },
  lineNote: {
    margin: 0,
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  copy: {
    justifySelf: "end",
  },
  /** The reasoning body: prose, secondary ink, relaxed leading. */
  reasoningBody: {
    color: vars["--ads-color-text-muted"],
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  progressList: {
    display: "grid",
    gap: vars["--ads-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  progressItem: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  /** The answer's sources sit one block below it, like the other end-of-turn blocks. */
  turnSources: {
    marginTop: vars["--ads-space-12"],
  },
});
