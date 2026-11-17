import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

const softHover = `color-mix(in oklch, ${vars["--aui-color-canvas"]} 75%, transparent)`;

export const userInputCardStyles = stylex.create({
  // ── Summary card ─────────────────────────────────────────────
  summary: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 70%, transparent)`,
    padding: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"],
  },
  summaryRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.625rem",
  },
  summaryBadge: {
    display: "flex",
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 10%, transparent)`,
    color: vars["--aui-color-accent"],
  },
  iconSm: { width: 14, height: 14 },
  summaryBody: { minWidth: 0, flex: 1 },
  summaryTitle: {
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  summaryDetail: {
    marginTop: vars["--aui-space-2"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: vars["--aui-color-text-muted"],
  },
  summaryFirstQuestion: {
    marginTop: vars["--aui-space-8"],
    color: vars["--aui-color-text"],
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  summaryMoreCount: { color: vars["--aui-color-text-muted"] },

  // ── Form ─────────────────────────────────────────────────────
  formBase: { fontSize: vars["--aui-font-size-body"] },
  formInline: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 80%, transparent)`,
    padding: vars["--aui-space-12"],
  },
  formComposer: {
    display: "flex",
    maxHeight: "min(60vh, 34rem)",
    flexDirection: "column",
    padding: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-20"],
    },
  },
  // The host card frames it and caps its height; the form only has to shrink
  // into that cap so the questions scroll and the actions stay in view.
  formEmbedded: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    minHeight: 0,
  },
  header: {
    display: "flex",
    flexShrink: 0,
    alignItems: "flex-start",
    gap: vars["--aui-space-12"],
  },
  headerBadge: {
    display: "flex",
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 10%, transparent)`,
    color: vars["--aui-color-accent"],
  },
  iconMd: { width: 16, height: 16 },
  headerBody: { minWidth: 0, flex: 1 },
  headerTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: "20px",
    color: vars["--aui-color-text"],
  },
  headerDetail: {
    marginTop: vars["--aui-space-2"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: vars["--aui-color-text-muted"],
  },
  questionsWrap: {},
  questionsWrapAfterHeader: { marginTop: vars["--aui-space-12"] },
  questionsWrapComposer: {
    marginInline: `calc(-1 * ${vars["--aui-space-4"]})`,
    minHeight: 0,
    flex: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingInline: vars["--aui-space-4"],
  },
  // Programmatic focus target for keyboard shortcuts; the controls inside
  // carry the visible focus indicators.
  formFocusTarget: { outlineStyle: "none" },

  // ── Steps (several questions) ────────────────────────────────
  steps: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    marginBottom: vars["--aui-space-12"],
  },
  step: {
    display: "inline-flex",
    minWidth: 0,
    maxWidth: "100%",
    alignItems: "center",
    gap: "0.375rem",
    borderWidth: 0,
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: {
      default: "transparent",
      ":hover": softHover,
    },
    paddingBlock: vars["--aui-space-4"],
    paddingInlineStart: "0.375rem",
    paddingInlineEnd: "0.625rem",
    cursor: "pointer",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
  },
  stepCurrent: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-accent"]} 10%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--aui-color-accent"]} 14%, transparent)`,
    },
    color: {
      default: vars["--aui-color-text"],
      ":hover": vars["--aui-color-text"],
    },
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  stepMark: {
    display: "inline-flex",
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-text"]} 7%, transparent)`,
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  stepMarkAnswered: {
    backgroundColor: vars["--aui-color-accent"],
    color: vars["--aui-color-accent-text"],
  },
  stepLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ── Question ─────────────────────────────────────────────────
  questionBlockDivided: {
    marginTop: vars["--aui-space-16"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    paddingTop: vars["--aui-space-16"],
  },
  fieldset: { minWidth: 0 },
  legend: { width: "100%" },
  eyebrow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
    marginBottom: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    color: vars["--aui-color-text-muted"],
  },
  eyebrowHeader: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  questionTitle: {
    display: "block",
    maxWidth: "48rem",
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-lead"],
    color: vars["--aui-color-text"],
  },
  // Transcript records and inline cards sit among messages, not in place of
  // the composer, so their titles stay at body size.
  questionTitleCompact: {
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-control"],
  },

  // ── Options ──────────────────────────────────────────────────
  // Rows, marks and keys come from `question-option-row.styles.ts`, shared
  // with every surface that draws a question's options.
  optionList: { marginTop: vars["--aui-space-12"] },
  /*
   * The focused or hovered option's preview, under the list it belongs to:
   * the eyebrow register for its name and a capped, scrollable text box that
   * keeps the provider's line breaks and wraps long lines.
   */
  optionPreviewSlot: {
    marginTop: vars["--aui-space-12"],
    display: "grid",
    minWidth: 0,
  },
  optionPreview: {
    gridArea: "1 / 1",
    alignSelf: "start",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  optionPreviewHidden: { visibility: "hidden" },
  optionPreviewLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text-muted"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionPreviewViewport: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
  },
  optionPreviewText: {
    margin: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  recordedAnswer: {
    marginTop: vars["--aui-space-12"],
    color: vars["--aui-color-text"],
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  iconXs: { width: 12, height: 12 },
  customInlineField: {
    minWidth: 0,
    flex: 1,
    appearance: "none",
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
    outlineStyle: "none",
    fontFamily: "inherit",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "20px",
    color: vars["--aui-color-text"],
    "::placeholder": { color: vars["--aui-color-text-muted"] },
  },
  customInlineTextarea: {
    display: "block",
    maxHeight: 160,
    resize: "none",
    fieldSizing: "content",
  },

  urlNotice: {
    marginTop: vars["--aui-space-12"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 20%, transparent)`,
    padding: vars["--aui-space-12"],
    alignItems: { "@media (min-width: 640px)": "center" },
  },
  urlNoticeText: {
    minWidth: 0,
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: vars["--aui-color-text-muted"],
    wordBreak: "break-all",
  },
  urlNoticeButton: {
    alignSelf: {
      default: "flex-start",
      "@media (min-width: 640px)": "auto",
    },
  },

  customInputWrap: { marginTop: vars["--aui-space-8"] },
  customTextarea: {
    minHeight: 80,
    maxHeight: 160,
    resize: "vertical",
    fontSize: vars["--aui-font-size-body"],
  },

  footer: {
    marginTop: vars["--aui-space-16"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  // Pull the ghost button's padding into the gutter so its label lines up
  // with the question text above it.
  declineButton: {
    marginInlineStart: `calc(-1 * ${vars["--aui-space-8"]})`,
  },
  footerActions: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--aui-space-12"],
    marginInlineStart: "auto",
  },
  keyboardHint: {
    display: {
      default: "none",
      "@media (min-width: 640px)": "inline-flex",
    },
    alignItems: "center",
    gap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    color: vars["--aui-color-text-muted"],
    whiteSpace: "nowrap",
  },
  disabledReason: {
    flexBasis: "100%",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: vars["--aui-color-text-muted"],
  },
});
