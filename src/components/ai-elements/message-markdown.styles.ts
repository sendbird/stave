import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

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

export const markdownStyles = stylex.create({
  // External link chip
  externalChip: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: "0.35em",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 45%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 100%, transparent)`,
    },
    paddingInline: "0.5em",
    paddingBlock: "0.14em",
    verticalAlign: "middle",
    fontSize: "0.8125em",
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: 1,
    color: vars["--ads-color-text"],
    textDecorationLine: "none",
    boxShadow: {
      default: vars["--ads-elevation-raised"],
      ":hover": vars["--ads-elevation-lift"],
    },
  },
  externalChipIcon: {
    width: "1em",
    height: "1em",
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
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
    color: vars["--ads-color-text-muted"],
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
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 40%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 100%, transparent)`,
    },
    paddingInline: "0.45em",
    paddingBlock: "0.1em",
    verticalAlign: "middle",
    fontSize: "0.8125em",
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: 1,
    color: vars["--ads-color-text"],
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
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
    paddingInline: "0.4em",
    paddingBlock: 0,
    fontSize: "0.625em",
    lineHeight: 1.4,
    color: vars["--ads-color-text-muted"],
  },

  // Markdown block elements
  hr: {
    marginBlock: vars["--ads-space-16"],
    height: 1,
    borderWidth: 0,
    backgroundColor: vars["--ads-color-border"],
    marginTop: { default: vars["--ads-space-16"], ":first-child": 0 },
    marginBottom: { default: vars["--ads-space-16"], ":last-child": 0 },
  },
  strong: {
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  /**
   * Transcript headings.
   *
   * These existed as unstyled `<h1>`–`<h6>` until now, which is the whole of
   * the "assistant text renders like a heading" report: with no component
   * override the elements fell through to the user-agent sheet at `2em` /
   * `1.5em` bold, and ADS's reset then removed the UA `margin-block` that had
   * at least separated them from the prose — so a heading landed as an
   * outsized bold line jammed into the paragraph flow.
   *
   * Sizes are `em`, not the `fontSize*` tokens, and that is deliberate: the
   * message body's own size is a host px value the reader sets
   * (`messageFontSize`), so an absolute rem step would keep the same size at
   * every zoom level and invert the hierarchy at the small end. `em` keeps the
   * ratio to whatever the reader chose. The steps are deliberately shallow —
   * a transcript heading is a section label inside a message, not a page
   * title, and h4–h6 stop scaling entirely and separate by weight alone.
   */
  heading: {
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    marginBottom: vars["--ads-space-4"],
    marginTop: { default: vars["--ads-space-16"], ":first-child": 0 },
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  heading1: {
    fontSize: "1.25em",
  },
  heading2: {
    fontSize: "1.125em",
  },
  heading3: {
    fontSize: "1em",
  },
  heading4: {
    color: vars["--ads-color-text-muted"],
    fontSize: "1em",
  },
  paragraph: {
    marginTop: {
      default: `var(${LI_PARAGRAPH_MARGIN}, ${vars["--ads-space-8"]})`,
      ":first-child": 0,
    },
    marginBottom: {
      default: `var(${LI_PARAGRAPH_MARGIN}, ${vars["--ads-space-8"]})`,
      ":last-child": 0,
    },
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  list: {
    "::marker": { color: vars["--ads-color-text-muted"] },
    marginBlock: vars["--ads-space-8"],
    marginLeft: vars["--ads-space-20"],
    paddingLeft: vars["--ads-space-4"],
  },
  listUnordered: { listStyleType: "disc" },
  listOrdered: { listStyleType: "decimal" },
  listItem: {
    "::marker": { color: vars["--ads-color-text-muted"] },
    [LI_PARAGRAPH_MARGIN]: "0px",
    marginBlock: vars["--ads-space-4"],
  },
  inlineCode: {
    marginInline: vars["--ads-space-2"],
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 40%, transparent)`,
    paddingInline: 6,
    paddingBlock: vars["--ads-space-2"],
    fontFamily: vars["--ads-font-mono"],
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  inlineCodeInCell: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  link: {
    color: vars["--ads-color-accent"],
    textDecorationLine: "underline",
    textUnderlineOffset: 2,
  },
  table: {
    marginBlock: vars["--ads-space-12"],
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: 0,
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: vars["--ads-color-surface"],
    fontSize: "0.875em",
  },
  tableHeader: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 40%, transparent)`,
  },
  tableRow: {
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 30%, transparent)`,
    },
  },
  tableHead: {
    height: "auto",
    borderRightWidth: { default: vars["--ads-border-width-hairline"], ":last-child": 0 },
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    verticalAlign: "top",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  tableCell: {
    borderRightWidth: { default: vars["--ads-border-width-hairline"], ":last-child": 0 },
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    verticalAlign: "top",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  // Root body
  body: {
    minWidth: 0,
    maxWidth: "100%",
  },
  streamingBody: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
});
