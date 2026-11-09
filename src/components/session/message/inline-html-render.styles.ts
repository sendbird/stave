import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The window's title bar row: the TopBar (`3rem`) that carries the native
 * window controls and the window drag region. An expanded block starts below
 * it, so the controls never sit on top of the block's caption.
 */
const TITLE_BAR_CLEARANCE = "3rem";

/**
 * Electron resolves `-webkit-app-region` from every element's box, not from
 * paint order: a block lifted over the TopBar would still drag the window
 * where it overlaps the drag region. The expanded block and its backdrop opt
 * out explicitly. StyleX has no typed key for it, so it travels as an inline
 * style, as in the TopBar.
 */
export const expandedNoDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/**
 * A page block in the conversation, shared by `stave_render_html` pages and
 * MCP App views: a caption row (title and actions) above a canvas that holds
 * the sandboxed frame. The caption is host chrome; the canvas is the page's
 * own area, tinted a step below the conversation so the page's cards and the
 * sandbox edge both read clearly.
 */
export const inlineHtmlRenderStyles = stylex.create({
  /** Holds the block's place in the conversation while it is expanded. */
  slot: {
    minInlineSize: 0,
  },
  figure: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    margin: 0,
    minInlineSize: 0,
  },
  /**
   * Expanded: the same element, lifted over the app. The frame is never
   * re-parented, so the page keeps its state instead of reloading. The
   * stacking layer is composed at the call site (`layers.lightbox`): the app
   * surface is its own stacking context, and pane sashes inside it sit at 99.
   */
  figureExpanded: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-modal"],
    gap: vars["--aui-space-8"],
    insetBlockEnd: vars["--aui-space-24"],
    insetBlockStart: `calc(${TITLE_BAR_CLEARANCE} + ${vars["--aui-space-12"]})`,
    insetInline: vars["--aui-space-24"],
    padding: vars["--aui-space-8"],
    position: "fixed",
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
    paddingInlineStart: vars["--aui-space-2"],
  },
  headerExpanded: {
    paddingInlineStart: vars["--aui-space-8"],
  },
  title: {
    color: vars["--aui-color-text"],
    flex: "1 1 auto",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: vars["--aui-space-2"],
  },
  /**
   * The page's area. Half a step between the conversation and the muted
   * surface: pages paint their own panels with `--card` and their quiet
   * fills with `--muted`, and both stay distinct on it.
   */
  canvas: {
    backgroundColor: `color-mix(in oklab, ${vars["--aui-color-canvas-subtle"]} 55%, ${vars["--aui-color-canvas"]})`,
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    minInlineSize: 0,
    overflow: "hidden",
  },
  canvasExpanded: {
    flex: "1 1 auto",
    minBlockSize: 0,
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
    minBlockSize: 0,
  },
  source: {
    backgroundColor: vars["--aui-color-surface"],
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    gap: vars["--aui-space-4"],
    justifyItems: "end",
    padding: vars["--aui-space-8"],
  },
  sourceExpanded: {
    flex: "0 0 auto",
    maxBlockSize: "40%",
  },
  sourceText: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantLigatures: "none",
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    maxBlockSize: "24rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  /** Where an unmounted frame was: its height, and an offer to show it again. */
  paused: {
    alignItems: "baseline",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    justifyContent: "center",
    lineHeight: vars["--aui-line-height-normal"],
    paddingBlock: vars["--aui-space-24"],
    paddingInline: vars["--aui-space-12"],
  },
  notice: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
});
