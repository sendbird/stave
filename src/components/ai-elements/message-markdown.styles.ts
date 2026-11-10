import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import { chatType } from "./chat-type.stylex";

/**
 * StyleX has no descendant selector, so the two markdown descendant contracts
 * are published as CSS custom properties that the descendant reads:
 *
 * - `--md-li-paragraph-margin`: a list item flattens its own paragraphs'
 *   vertical margin (was `[&>p]:my-0`). The `paragraph` style reads it.
 *
 * Inline code inside a table cell (`[&_code]:whitespace-pre-wrap
 * [&_code]:break-all`) is handled in the component via the existing
 * `MarkdownTableCellContext` rather than a descendant selector.
 */
const LI_PARAGRAPH_MARGIN = "--md-li-paragraph-margin";

/**
 * One spacing rule for every block in a reply: a paragraph, list, table, code
 * block or rule ends with this gap and starts with none, so any two blocks sit
 * the same distance apart. Headings add more above than below
 * (`heading`), which ties each to the section it opens.
 */
export const MARKDOWN_BLOCK_GAP = vars["--aui-space-12"];
const BLOCK_END = `var(${LI_PARAGRAPH_MARGIN}, ${MARKDOWN_BLOCK_GAP})`;

const SECONDARY = chatType["--chat-type-secondary"];
const META = chatType["--chat-type-meta"];
const BODY = chatType["--chat-type-body"];

export const markdownStyles = stylex.create({
  // External link chip
  externalChip: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: "0.35em",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 45%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 100%, transparent)`,
    },
    paddingInline: "0.5em",
    // With the secondary line this is a 24px box: the link's hit area.
    paddingBlock: vars["--aui-space-2"],
    verticalAlign: "middle",
    fontSize: SECONDARY,
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: chatType["--chat-type-secondary-leading"],
    color: vars["--aui-color-text"],
    textDecorationLine: "none",
    boxShadow: {
      default: vars["--aui-elevation-raised"],
      ":hover": vars["--aui-elevation-lift"],
    },
  },
  externalChipIcon: {
    width: "1em",
    height: "1em",
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  externalChipLabel: {
    minWidth: 0,
    maxWidth: 256,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  externalChipExternalIcon: {
    width: "0.9em",
    height: "0.9em",
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  tooltipContent: {
    maxWidth: 384,
    wordBreak: "break-all",
  },

  // File link chip
  fileLink: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: "0.3em",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 80%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 40%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 100%, transparent)`,
    },
    paddingInline: "0.45em",
    // With the secondary line this is a 24px box: the link's hit area.
    paddingBlock: vars["--aui-space-2"],
    verticalAlign: "middle",
    fontSize: SECONDARY,
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: chatType["--chat-type-secondary-leading"],
    color: vars["--aui-color-text"],
    textDecorationLine: "none",
  },
  fileLinkIcon: {
    height: "1.1em",
    width: "0.9em",
  },
  fileLinkName: {
    minWidth: 0,
    maxWidth: 256,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileLinkLocation: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 70%, transparent)`,
    paddingInline: "0.4em",
    paddingBlock: 0,
    fontSize: META,
    lineHeight: chatType["--chat-type-meta-leading"],
    color: vars["--aui-color-text-muted"],
  },

  // Markdown block elements
  hr: {
    height: 1,
    borderWidth: 0,
    backgroundColor: vars["--aui-color-border"],
    marginTop: { default: MARKDOWN_BLOCK_GAP, ":first-child": 0 },
    marginBottom: { default: MARKDOWN_BLOCK_GAP, ":last-child": 0 },
  },
  strong: {
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  /**
   * Transcript headings.
   *
   * Sized from the scale's `body` (the reader's chat font size), so the steps
   * hold their ratio at every setting and inside a panel's capped scale. Each
   * level is a clear step: h1 1.5×, h2 1.25×, h3 1.125× (24/20/18px beside a
   * 16px reply, the AUI title/heading steps and the one between); h4–h6 keep
   * the body size and separate by weight and ink. A heading takes 24px above
   * and 8px below, so it binds to the section it opens rather than the one
   * before it.
   */
  heading: {
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    marginBottom: vars["--aui-space-8"],
    marginTop: { default: vars["--aui-space-24"], ":first-child": 0 },
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  heading1: {
    fontSize: `calc(${BODY} * 1.5)`,
  },
  heading2: {
    fontSize: `calc(${BODY} * 1.25)`,
  },
  heading3: {
    fontSize: `calc(${BODY} * 1.125)`,
  },
  heading4: {
    color: vars["--aui-color-text-muted"],
    fontSize: BODY,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: { default: BLOCK_END, ":last-child": 0 },
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  list: {
    "::marker": { color: vars["--aui-color-text-muted"] },
    marginTop: 0,
    // Inside a list item the nested list sits tight, like the item's paragraphs.
    marginBottom: { default: BLOCK_END, ":last-child": 0 },
    marginLeft: vars["--aui-space-20"],
    paddingLeft: vars["--aui-space-4"],
  },
  listUnordered: { listStyleType: "disc" },
  listOrdered: { listStyleType: "decimal" },
  listItem: {
    "::marker": { color: vars["--aui-color-text-muted"] },
    [LI_PARAGRAPH_MARGIN]: "0px",
    marginBlock: vars["--aui-space-4"],
  },
  inlineCode: {
    marginInline: vars["--aui-space-2"],
    borderRadius: vars["--aui-radius-mark"],
    // A soft ink wash and no outline: translucent, so the span reads the same
    // on the transcript and inside the user bubble.
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-text"]} 6%, transparent)`,
    paddingInline: 6,
    paddingBlock: vars["--aui-space-2"],
    fontFamily: vars["--aui-font-mono"],
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  inlineCodeInCell: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  link: {
    color: vars["--aui-color-accent"],
    textDecorationLine: "underline",
    textUnderlineOffset: 2,
  },
  /*
   * Sized by its content: at least the box it sits in, wider only as far as
   * its columns need. Columns take widths from their content, words stay
   * whole, and a table whose words cannot fit scrolls inside its own box.
   * In a reply's top level that box is the breakout (`transcript-wide.tsx`),
   * so the table's natural width is what decides how far past the column it
   * may grow.
   */
  table: {
    marginTop: 0,
    marginBottom: { default: MARKDOWN_BLOCK_GAP, ":last-child": 0 },
    inlineSize: "auto",
    minInlineSize: "100%",
    tableLayout: "auto",
    borderCollapse: "separate",
    borderSpacing: 0,
    borderRadius: vars["--aui-radius-control"],
    // Clips the header and row washes to the rounded corners.
    overflow: "hidden",
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: vars["--aui-color-surface"],
    fontSize: SECONDARY,
    lineHeight: chatType["--chat-type-secondary-leading"],
  },
  /**
   * The AUI table header: muted ink and semibold weight at the scale's meta
   * step, on the subtle canvas band AUI uses for a table's own sections
   * (its footer), so the header reads apart from the rows under it.
   */
  tableHeader: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
  },
  tableRow: {
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 30%, transparent)`,
    },
  },
  tableHead: {
    height: "auto",
    color: vars["--aui-color-text-muted"],
    fontSize: META,
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: chatType["--chat-type-meta-leading"],
    // The first body row's rule is the header's seam, so the head draws none.
    borderBlockEndWidth: 0,
    borderRightWidth: { default: vars["--aui-border-width-hairline"], ":last-child": 0 },
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    verticalAlign: "top",
    whiteSpace: "normal",
    overflowWrap: "break-word",
  },
  /** Rows are ruled with the AUI row hairline; the separate border model needs it on the cell. */
  tableCell: {
    // The AUI `<table>` sets its own 14px; the cell takes the scale's step.
    fontSize: SECONDARY,
    lineHeight: chatType["--chat-type-secondary-leading"],
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderBlockStartStyle: "solid",
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderRightWidth: { default: vars["--aui-border-width-hairline"], ":last-child": 0 },
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    verticalAlign: "top",
    whiteSpace: "normal",
    overflowWrap: "break-word",
  },

  // Root body
  body: {
    minWidth: 0,
    maxWidth: "100%",
  },
});
