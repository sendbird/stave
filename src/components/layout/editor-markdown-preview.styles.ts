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
 * `vars.space12` as a literal: StyleX has to resolve a token to its declared
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
    paddingBlock: vars.space20,
    paddingInline: vars.space24,
  },
  body: { minWidth: 0 },

  h1: {
    fontSize: "1.875rem",
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.025em",
    marginBottom: vars.space20,
    marginTop: { default: vars.space8, ":first-child": 0 },
  },
  h2: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    fontSize: vars.fontSizeTitle,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.025em",
    marginBottom: vars.space12,
    marginTop: { default: vars.space32, ":first-child": 0 },
    paddingBottom: vars.space8,
  },
  h3: {
    fontSize: vars.fontSizeHeading,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.025em",
    marginBottom: vars.space8,
    marginTop: vars.space24,
  },
  h4: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.025em",
    marginBottom: vars.space8,
    marginTop: vars.space20,
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
    "::marker": { color: vars.colorTextMuted },
    marginBlock: vars.space12,
    marginLeft: vars.space20,
  },
  listUnordered: { listStyleType: "disc" },
  listOrdered: { listStyleType: "decimal" },
  listItem: {
    [PARAGRAPH_MARGIN]: "0px",
    marginTop: { default: vars.space4, ":first-child": 0 },
  },
  blockquote: {
    borderLeftColor: vars.colorBorder,
    borderLeftStyle: "solid",
    borderLeftWidth: 2,
    color: vars.colorTextMuted,
    marginBlock: vars.space16,
    paddingLeft: vars.space16,
  },
  rule: {
    backgroundColor: vars.colorBorder,
    borderWidth: 0,
    height: 1,
    marginBlock: vars.space24,
  },

  codeBlock: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    marginBlock: vars.space16,
    overflow: "hidden",
  },
  codeBlockLanguage: {
    backgroundColor: "var(--editor-muted)",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.08em",
    paddingBlock: 6,
    paddingInline: vars.space12,
    textTransform: "uppercase",
  },
  codeBlockPre: {
    backgroundColor: "var(--editor)",
    color: "var(--editor-foreground)",
    fontFamily: vars.fontMono,
    overflowX: "auto",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  inlineCode: {
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 40%, transparent)`,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontFamily: vars.fontMono,
    marginInline: vars.space2,
    paddingBlock: vars.space2,
    paddingInline: 6,
  },
  link: {
    color: vars.colorAccent,
    textDecorationLine: "underline",
    textUnderlineOffset: 2,
  },

  table: {
    backgroundColor: vars.colorSurface,
    borderCollapse: "separate",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderSpacing: 0,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    marginBlock: vars.space16,
    tableLayout: "fixed",
    textAlign: "left",
    width: "100%",
  },
  tableHeader: {
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 40%, transparent)`,
  },
  tableRow: {
    backgroundColor: {
      default: null,
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 30%, transparent)`,
    },
  },
  tableCell: {
    borderRightColor: vars.colorBorder,
    borderRightStyle: "solid",
    borderRightWidth: { default: vars.borderWidthHairline, ":last-child": 0 },
    height: "auto",
    overflowWrap: "anywhere",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    verticalAlign: "top",
    whiteSpace: "normal",
  },
});
