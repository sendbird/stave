import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const softHover = `color-mix(in oklch, ${vars["--ads-color-canvas"]} 75%, transparent)`;

export const userInputCardStyles = stylex.create({
  // ── Summary card ─────────────────────────────────────────────
  summary: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
    padding: vars["--ads-space-12"],
    fontSize: "0.8125rem",
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
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
    color: vars["--ads-color-accent"],
  },
  iconSm: { width: 14, height: 14 },
  summaryBody: { minWidth: 0, flex: 1 },
  summaryTitle: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  summaryDetail: {
    marginTop: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: vars["--ads-color-text-muted"],
  },
  summaryFirstQuestion: {
    marginTop: vars["--ads-space-8"],
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  summaryMoreCount: { color: vars["--ads-color-text-muted"] },

  // ── Form ─────────────────────────────────────────────────────
  formBase: { fontSize: vars["--ads-font-size-body"] },
  formInline: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 80%, transparent)`,
    padding: vars["--ads-space-12"],
  },
  formComposer: {
    display: "flex",
    maxHeight: "min(60vh, 34rem)",
    flexDirection: "column",
    padding: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-20"],
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
    gap: vars["--ads-space-12"],
  },
  headerBadge: {
    display: "flex",
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
    color: vars["--ads-color-accent"],
  },
  iconMd: { width: 16, height: 16 },
  headerBody: { minWidth: 0, flex: 1 },
  headerTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: "20px",
    color: vars["--ads-color-text"],
  },
  headerDetail: {
    marginTop: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: vars["--ads-color-text-muted"],
  },
  questionsWrap: {},
  questionsWrapAfterHeader: { marginTop: vars["--ads-space-12"] },
  questionsWrapComposer: {
    marginInline: `calc(-1 * ${vars["--ads-space-4"]})`,
    minHeight: 0,
    flex: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingInline: vars["--ads-space-4"],
  },
  // Programmatic focus target for keyboard shortcuts; the controls inside
  // carry the visible focus indicators.
  formFocusTarget: { outlineStyle: "none" },

  // ── Steps (several questions) ────────────────────────────────
  steps: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
    marginBottom: vars["--ads-space-12"],
  },
  step: {
    display: "inline-flex",
    minWidth: 0,
    maxWidth: "100%",
    alignItems: "center",
    gap: "0.375rem",
    borderWidth: 0,
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: {
      default: "transparent",
      ":hover": softHover,
    },
    paddingBlock: vars["--ads-space-4"],
    paddingInlineStart: "0.375rem",
    paddingInlineEnd: "0.625rem",
    cursor: "pointer",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "16px",
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  stepCurrent: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent"]} 14%, transparent)`,
    },
    color: {
      default: vars["--ads-color-text"],
      ":hover": vars["--ads-color-text"],
    },
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  stepMark: {
    display: "inline-flex",
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-text"]} 7%, transparent)`,
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  stepMarkAnswered: {
    backgroundColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  stepLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ── Question ─────────────────────────────────────────────────
  questionBlockDivided: {
    marginTop: vars["--ads-space-16"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    paddingTop: vars["--ads-space-16"],
  },
  fieldset: { minWidth: 0 },
  legend: { width: "100%" },
  eyebrow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
    marginBottom: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "16px",
    color: vars["--ads-color-text-muted"],
  },
  eyebrowHeader: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  questionTitle: {
    display: "block",
    maxWidth: "48rem",
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-lead"],
    color: vars["--ads-color-text"],
  },
  // Transcript records and inline cards sit among messages, not in place of
  // the composer, so their titles stay at body size.
  questionTitleCompact: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-control"],
  },

  // ── Options ──────────────────────────────────────────────────
  optionList: {
    marginTop: vars["--ads-space-12"],
    overflow: "hidden",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 90%, transparent)`,
  },
  optionRow: {
    position: "relative",
    display: "flex",
    minWidth: 0,
    cursor: "pointer",
    alignItems: "flex-start",
    gap: vars["--ads-space-12"],
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
    },
    paddingInline: vars["--ads-space-12"],
    paddingBlock: "0.625rem",
    transitionProperty: "background-color",
    transitionDuration: {
      default: "150ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  optionRowDivided: {
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
  },
  // The list clips its rows to the rounded corners, so the keyboard ring is
  // drawn inside each row instead of outside it.
  optionRowFocusInset: {
    outlineOffset: {
      default: 0,
      ":has(:focus-visible)": `calc(-1 * (${vars["--ads-focus-ring-offset"]} + ${vars["--ads-focus-ring-width"]}))`,
    },
  },
  optionRowSelected: {
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-accent"]} 7%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
    },
  },
  optionDisabled: {
    pointerEvents: "none",
    cursor: "not-allowed",
    opacity: 0.45,
  },
  optionReadOnly: { pointerEvents: "none", cursor: "default" },
  optionIndex: {
    marginTop: 1,
    display: "flex",
    width: 18,
    height: 18,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-text"]} 6%, transparent)`,
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  optionIndexSelected: {
    backgroundColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  recordedAnswer: {
    marginTop: vars["--ads-space-12"],
    color: vars["--ads-color-text"],
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
  optionBody: { minWidth: 0, flex: 1 },
  optionLabelRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
  },
  optionLabel: {
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "20px",
    color: vars["--ads-color-text"],
  },
  recommendedBadge: {
    height: 16,
    paddingInline: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
  },
  optionDescription: {
    marginTop: vars["--ads-space-2"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "18px",
    color: vars["--ads-color-text-muted"],
  },
  customRow: {
    alignItems: "center",
    cursor: "text",
  },
  customInlineField: {
    minWidth: 0,
    flex: 1,
    appearance: "none",
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
    outlineStyle: "none",
    fontFamily: "inherit",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "20px",
    color: vars["--ads-color-text"],
    "::placeholder": { color: vars["--ads-color-text-muted"] },
  },
  customInlineTextarea: {
    display: "block",
    maxHeight: 160,
    resize: "none",
    fieldSizing: "content",
  },

  urlNotice: {
    marginTop: vars["--ads-space-12"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 20%, transparent)`,
    padding: vars["--ads-space-12"],
    alignItems: { "@media (min-width: 640px)": "center" },
  },
  urlNoticeText: {
    minWidth: 0,
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: vars["--ads-color-text-muted"],
    wordBreak: "break-all",
  },
  urlNoticeButton: {
    alignSelf: {
      default: "flex-start",
      "@media (min-width: 640px)": "auto",
    },
  },

  customInputWrap: { marginTop: vars["--ads-space-8"] },
  customTextarea: {
    minHeight: 80,
    maxHeight: 160,
    resize: "vertical",
    fontSize: vars["--ads-font-size-body"],
  },

  footer: {
    marginTop: vars["--ads-space-16"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  // Pull the ghost button's padding into the gutter so its label lines up
  // with the question text above it.
  declineButton: {
    marginInlineStart: `calc(-1 * ${vars["--ads-space-8"]})`,
  },
  footerActions: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-12"],
    marginInlineStart: "auto",
  },
  keyboardHint: {
    display: {
      default: "none",
      "@media (min-width: 640px)": "inline-flex",
    },
    alignItems: "center",
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "16px",
    color: vars["--ads-color-text-muted"],
    whiteSpace: "nowrap",
  },
  disabledReason: {
    flexBasis: "100%",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: vars["--ads-color-text-muted"],
  },
});
