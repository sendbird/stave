import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

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
 * `vars["--ads-space-12"]` as a literal: StyleX has to resolve a token to its declared
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
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-24"],
  },
  body: { minWidth: 0 },

  h1: {
    fontSize: "1.875rem",
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--ads-space-20"],
    marginTop: { default: vars["--ads-space-8"], ":first-child": 0 },
  },
  h2: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    fontSize: vars["--ads-font-size-title"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--ads-space-12"],
    marginTop: { default: vars["--ads-space-32"], ":first-child": 0 },
    paddingBottom: vars["--ads-space-8"],
  },
  h3: {
    fontSize: vars["--ads-font-size-heading"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--ads-space-8"],
    marginTop: vars["--ads-space-24"],
  },
  h4: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    marginBottom: vars["--ads-space-8"],
    marginTop: vars["--ads-space-20"],
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
    whiteSpace: "pre-wrap",
  },
  list: {
    "::marker": { color: vars["--ads-color-text-muted"] },
    marginBlock: vars["--ads-space-12"],
    marginLeft: vars["--ads-space-20"],
  },
  listUnordered: { listStyleType: "disc" },
  listOrdered: { listStyleType: "decimal" },
  listItem: {
    [PARAGRAPH_MARGIN]: "0px",
    marginTop: { default: vars["--ads-space-4"], ":first-child": 0 },
  },
  blockquote: {
    borderLeftColor: vars["--ads-color-border"],
    borderLeftStyle: "solid",
    borderLeftWidth: 2,
    color: vars["--ads-color-text-muted"],
    marginBlock: vars["--ads-space-16"],
    paddingLeft: vars["--ads-space-16"],
  },
  rule: {
    backgroundColor: vars["--ads-color-border"],
    borderWidth: 0,
    height: 1,
    marginBlock: vars["--ads-space-24"],
  },

  codeBlock: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    marginBlock: vars["--ads-space-16"],
    overflow: "hidden",
  },
  codeBlockLanguage: {
    backgroundColor: "var(--editor-muted)",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.08em",
    paddingBlock: 6,
    paddingInline: vars["--ads-space-12"],
    textTransform: "uppercase",
  },
  codeBlockPre: {
    backgroundColor: "var(--editor)",
    color: "var(--editor-foreground)",
    fontFamily: vars["--ads-font-mono"],
    overflowX: "auto",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  inlineCode: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 40%, transparent)`,
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    fontFamily: vars["--ads-font-mono"],
    marginInline: vars["--ads-space-2"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: 6,
  },
  link: {
    color: vars["--ads-color-accent"],
    textDecorationLine: "underline",
    textUnderlineOffset: 2,
  },

  table: {
    backgroundColor: vars["--ads-color-surface"],
    borderCollapse: "separate",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderSpacing: 0,
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    marginBlock: vars["--ads-space-16"],
    tableLayout: "fixed",
    textAlign: "left",
    width: "100%",
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
  tableCell: {
    borderRightColor: vars["--ads-color-border"],
    borderRightStyle: "solid",
    borderRightWidth: { default: vars["--ads-border-width-hairline"], ":last-child": 0 },
    height: "auto",
    overflowWrap: "anywhere",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    verticalAlign: "top",
    whiteSpace: "normal",
  },
});
