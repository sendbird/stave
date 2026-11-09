import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const turnEventRowStyles = stylex.create({
  output: {
    display: "grid",
    gap: vars["--aui-space-4"],
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "start",
    columnGap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  /**
   * Provider output in the machine register. `pre-wrap` keeps the tool's own
   * line breaks; `overflow-wrap: anywhere` stops one long path from setting a
   * min-content width wider than the disclosure that holds it.
   */
  outputText: {
    gridColumn: 1,
    gridRow: 1,
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantLigatures: "none",
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  outputProse: {
    fontFamily: vars["--aui-font-sans"],
  },
  /* The capped box takes the section's width, so the cut and its fade run
     edge to edge whatever the longest line measures. */
  capped: {
    gridColumn: 1,
    gridRow: 1,
    justifySelf: "stretch",
    minInlineSize: 0,
  },
  lineNote: {
    gridColumn: 1,
    margin: 0,
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  copy: {
    gridColumn: 2,
    gridRow: 1,
    justifySelf: "end",
  },
  /** The reasoning body: prose, secondary ink, relaxed leading. */
  reasoningBody: {
    color: vars["--aui-color-text-muted"],
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  progressList: {
    display: "grid",
    gap: vars["--aui-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  progressItem: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  /** The answer's sources sit one block below it, like the other end-of-turn blocks. */
  turnSources: {
    marginTop: vars["--aui-space-12"],
  },
});
