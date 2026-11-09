import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * The preview paints inside the editor surface, so `--editor*` (the Monaco
 * theme palette) is the correct ground here rather than the app canvas.
 *
 * `--stave-md-paragraph-margin` is how a list item flattens the paragraph
 * margins of its own descendants: StyleX has no descendant selector, so the
 * list item publishes the value and the paragraph reads it.
 */
const PARAGRAPH_MARGIN = "--stave-md-paragraph-margin";
/**
 * `vars["--aui-space-12"]` as a literal: StyleX has to resolve a token to its declared
 * value when it is used as a `var()` fallback, which it cannot do through the
 * `@/` alias, so the fallback is spelled out.
 */
const PARAGRAPH_MARGIN_DEFAULT = "0.75rem";

export const editorMarkdownPreviewStyles = stylex.create({
  root: { backgroundColor: "var(--editor)", height: "100%", overflow: "auto" },
  page: {
    color: "var(--editor-foreground)",
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
    width: "100%",
  },
  pageEmbedded: {
    maxWidth: "none",
    paddingBlock: 0,
    paddingInline: 0,
    textAlign: "left",
  },
  pageEditor: {
    marginInline: "auto",
    maxWidth: "56rem",
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-24"],
  },
  body: { minWidth: 0 },

  h1: {
    fontSize: vars["--aui-font-size-display"],
    lineHeight: vars["--aui-line-height-display"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--aui-space-20"],
    marginTop: { default: vars["--aui-space-8"], ":first-child": 0 },
  },
  h2: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--aui-space-12"],
    marginTop: { default: vars["--aui-space-32"], ":first-child": 0 },
    paddingBottom: vars["--aui-space-8"],
  },
  h3: {
    fontSize: vars["--aui-font-size-heading"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--aui-space-8"],
    marginTop: vars["--aui-space-24"],
  },
  h4: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--aui-space-8"],
    marginTop: vars["--aui-space-20"],
  },
  paragraph: {
    marginBottom: {
      default: `var(${PARAGRAPH_MARGIN}, ${PARAGRAPH_MARGIN_DEFAULT})`,
      ":last-child": 0,
    },
    marginTop: {
      default: `var(${PARAGRAPH_MARGIN}, ${PARAGRAPH_MARGIN_DEFAULT})`,
      ":first-child": 0,
    },
    overflowWrap: "anywhere",
  },
  /**
   * `lineBreaks="preserve"`: every newline breaks the line, for notes typed
   * line by line. Files and skills wrap like any Markdown renderer, so a
   * hard-wrapped document does not break mid-sentence.
   */
  paragraphPreserveBreaks: {
    whiteSpace: "pre-wrap",
  },
  list: {
    "::marker": { color: vars["--aui-color-text-muted"] },
    marginBlock: vars["--aui-space-12"],
    marginLeft: vars["--aui-space-20"],
  },
  listUnordered: { listStyleType: "disc" },
  listOrdered: { listStyleType: "decimal" },
  listItem: {
    [PARAGRAPH_MARGIN]: "0px",
    marginTop: { default: vars["--aui-space-4"], ":first-child": 0 },
  },
  blockquote: {
    borderLeftColor: vars["--aui-color-border"],
    borderLeftStyle: "solid",
    borderLeftWidth: 2,
    color: vars["--aui-color-text-muted"],
    marginBlock: vars["--aui-space-16"],
    paddingLeft: vars["--aui-space-16"],
  },
  rule: {
    backgroundColor: vars["--aui-color-border"],
    borderWidth: 0,
    height: 1,
    marginBlock: vars["--aui-space-24"],
  },

  inlineCode: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 40%, transparent)`,
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    fontFamily: vars["--aui-font-mono"],
    marginInline: vars["--aui-space-2"],
    paddingBlock: vars["--aui-space-2"],
    paddingInline: 6,
  },
  link: {
    color: vars["--aui-color-accent"],
    textDecorationLine: "underline",
    textUnderlineOffset: 2,
  },

  table: {
    backgroundColor: vars["--aui-color-surface"],
    borderCollapse: "separate",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderSpacing: 0,
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    marginBlock: vars["--aui-space-16"],
    tableLayout: "fixed",
    textAlign: "left",
    width: "100%",
  },
  tableHeader: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 40%, transparent)`,
  },
  tableRow: {
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 30%, transparent)`,
    },
  },
  tableCell: {
    borderRightColor: vars["--aui-color-border"],
    borderRightStyle: "solid",
    borderRightWidth: { default: vars["--aui-border-width-hairline"], ":last-child": 0 },
    height: "auto",
    overflowWrap: "anywhere",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    verticalAlign: "top",
    whiteSpace: "normal",
  },
});
