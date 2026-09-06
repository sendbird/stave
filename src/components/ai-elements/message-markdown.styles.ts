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
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars.colorCanvasSubtle} 45%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 100%, transparent)`,
    },
    paddingInline: "0.5em",
    paddingBlock: "0.14em",
    verticalAlign: "middle",
    fontSize: "0.8125em",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
    color: vars.colorText,
    textDecorationLine: "none",
    boxShadow: {
      default: vars.elevationRaised,
      ":hover": vars.elevationLift,
    },
  },
  externalChipIcon: {
    width: "1em",
    height: "1em",
    flexShrink: 0,
    color: vars.colorTextMuted,
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
    color: vars.colorTextMuted,
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
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars.colorCanvasSubtle} 40%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 100%, transparent)`,
    },
    paddingInline: "0.45em",
    paddingBlock: "0.1em",
    verticalAlign: "middle",
    fontSize: "0.8125em",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
    color: vars.colorText,
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
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 70%, transparent)`,
    paddingInline: "0.4em",
    paddingBlock: 0,
    fontSize: "0.625em",
    lineHeight: 1.4,
    color: vars.colorTextMuted,
  },

  // Markdown block elements
  hr: {
    marginBlock: vars.space16,
    height: 1,
    borderWidth: 0,
    backgroundColor: vars.colorBorder,
    marginTop: { default: vars.space16, ":first-child": 0 },
    marginBottom: { default: vars.space16, ":last-child": 0 },
  },
  strong: {
    fontWeight: vars.fontWeightSemibold,
  },
  paragraph: {
    marginTop: {
      default: `var(${LI_PARAGRAPH_MARGIN}, ${vars.space8})`,
      ":first-child": 0,
    },
    marginBottom: {
      default: `var(${LI_PARAGRAPH_MARGIN}, ${vars.space8})`,
      ":last-child": 0,
    },
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  list: {
    "::marker": { color: vars.colorTextMuted },
    marginBlock: vars.space8,
    marginLeft: vars.space20,
    paddingLeft: vars.space4,
  },
  listUnordered: { listStyleType: "disc" },
  listOrdered: { listStyleType: "decimal" },
  listItem: {
    "::marker": { color: vars.colorTextMuted },
    [LI_PARAGRAPH_MARGIN]: "0px",
    marginBlock: vars.space4,
  },
  inlineCode: {
    marginInline: vars.space2,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 40%, transparent)`,
    paddingInline: 6,
    paddingBlock: vars.space2,
    fontFamily: vars.fontMono,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  inlineCodeInCell: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  link: {
    color: vars.colorAccent,
    textDecorationLine: "underline",
    textUnderlineOffset: 2,
  },
  table: {
    marginBlock: vars.space12,
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "separate",
    borderSpacing: 0,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: vars.colorSurface,
    fontSize: "0.875em",
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
  tableHead: {
    height: "auto",
    borderRightWidth: { default: vars.borderWidthHairline, ":last-child": 0 },
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    verticalAlign: "top",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  tableCell: {
    borderRightWidth: { default: vars.borderWidthHairline, ":last-child": 0 },
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
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
