import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const inlineHtmlRenderStyles = stylex.create({
  /** Holds the block's place in the conversation while it is expanded. */
  slot: {
    minInlineSize: 0,
  },
  figure: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    margin: 0,
    minInlineSize: 0,
    overflow: "hidden",
  },
  /**
   * Expanded: the same element, lifted over the app. The frame is never
   * re-parented, so the page keeps its state instead of reloading.
   */
  figureExpanded: {
    backgroundColor: vars["--ads-color-surface-raised"],
    boxShadow: vars["--ads-elevation-modal"],
    inset: vars["--ads-space-24"],
    position: "fixed",
    zIndex: vars["--ads-z-index-modal"],
  },
  header: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-2"],
    paddingInlineEnd: vars["--ads-space-4"],
    paddingInlineStart: vars["--ads-space-12"],
  },
  title: {
    color: vars["--ads-color-text"],
    flex: "1 1 auto",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: vars["--ads-space-2"],
  },
  frame: {
    backgroundColor: "transparent",
    borderWidth: 0,
    display: "block",
    inlineSize: "100%",
  },
  frameExpanded: {
    blockSize: "100%",
    flex: "1 1 auto",
  },
  source: {
    borderBlockStartColor: vars["--ads-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-4"],
    justifyItems: "end",
    padding: vars["--ads-space-8"],
  },
  sourceExpanded: {
    flex: "0 0 auto",
    maxBlockSize: "40%",
  },
  sourceText: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantLigatures: "none",
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    maxBlockSize: "24rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  /** Where an unmounted frame was: its height, and an offer to show it again. */
  paused: {
    alignItems: "baseline",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    justifyContent: "center",
    lineHeight: vars["--ads-line-height-normal"],
    paddingBlock: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-12"],
  },
  notice: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
});
