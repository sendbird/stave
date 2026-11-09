import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * "Go to file" chrome for the top bar.
 *
 * The field is deliberately NOT `Command`'s palette input row: a palette input
 * is 52px tall by design and this one has to sit inside a 48px drag region, so
 * the row is composed here from the headless autocomplete input and owns its
 * own compact geometry.
 */
/**
 * The top bar's own width step for the field (`top-bar.styles.ts`
 * `TOP_BAR_SEARCH`). StyleX resolves each file's queries on its own, so the
 * string is repeated rather than imported.
 */
const TOP_BAR_SEARCH = "@container topBar (min-width: 56rem)";

export const fileSearchStyles = stylex.create({
  // The top bar slot already caps the width; the field just fills it.
  root: { maxWidth: 380, minWidth: 0, position: "relative", width: "100%" },
  // Geometry and fill are the bar's own control recipe, composed at the call
  // site; this only says when the button stands in for the field.
  compactTrigger: {
    display: { default: "inline-flex", [TOP_BAR_SEARCH]: "none" },
  },
  // While the field is open over the bar the button keeps its box, so the
  // controls beside it do not shift, but it is out of sight and of the Tab
  // order.
  compactTriggerHidden: { visibility: "hidden" },
  field: { display: { default: "none", [TOP_BAR_SEARCH]: "block" } },
  // Opened from the button on a narrow bar, the field lies over the controls
  // beside it, ending where the button ends, instead of pushing them aside.
  // It sits on the bar's own surface: the row's hover fill is a translucent
  // overlay, which on its own let the chips underneath show through.
  fieldExpanded: {
    backgroundColor: {
      default: vars["--aui-color-surface"],
      [TOP_BAR_SEARCH]: "transparent",
    },
    borderRadius: vars["--aui-radius-control"],
    display: "block",
    insetInlineEnd: { default: 0, [TOP_BAR_SEARCH]: "auto" },
    position: { default: "absolute", [TOP_BAR_SEARCH]: "static" },
    top: { default: "50%", [TOP_BAR_SEARCH]: "auto" },
    transform: { default: "translateY(-50%)", [TOP_BAR_SEARCH]: "none" },
    width: { default: "min(380px, 60vw)", [TOP_BAR_SEARCH]: "auto" },
  },
  // The quick-open keys at the end of the idle field.
  keyHint: { display: "inline-flex", flexShrink: 0 },
  command: {
    backgroundColor: "transparent",
    height: "auto",
    overflow: "visible",
    padding: 0,
    position: "relative",
  },
  /*
   * Geometry and fill come from `topBarControlStyles.control` + `.surface`,
   * composed at the call site: this row is the sixth control in the 48px bar and
   * was the one that hand-rolled its own numbers — a 28px box against its
   * siblings' 32, a 10px gutter against their 8, and its own `colorCanvas` fill
   * restated rather than taken from the shared chrome. What is left here is only
   * what makes it a field rather than a button.
   */
  inputRow: {
    display: "flex",
    position: "relative",
    transitionDuration: {
      default: vars["--aui-motion-duration-emphasis"],
      "@media (prefers-reduced-motion: reduce)": vars["--aui-motion-duration-micro"],
    },
    transitionProperty: "background-color, border-color, box-shadow",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  inputRowOpen: {
    borderColor: vars["--aui-color-border-focus"],
    boxShadow: `0 0 0 3px ${vars["--aui-color-accent-soft"]}`,
  },
  searchIcon: { color: vars["--aui-color-text-subtle"], flexShrink: 0, height: 14, width: 14 },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: vars["--aui-color-text"],
    flex: 1,
    fontFamily: vars["--aui-font-sans"],
    // The bar reads as one dense chrome row: Caption everywhere, including the
    // field's own text and placeholder. Body here made the search string a step
    // larger than every label beside it.
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    minWidth: 0,
    outlineStyle: "none",
    padding: 0,
    // `flex` sizes the field, not the input's own default width: that
    // intrinsic ~150px used to set the search slot's floor, so the trailing
    // groups kept room the lead needed and the lead slid under them.
    width: 0,
    "::placeholder": { color: vars["--aui-color-text-placeholder"] },
  },
  panel: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-modal"],
    insetInlineStart: "50%",
    minWidth: {
      default: 260,
      "@media (min-width: 64rem)": 320,
      "@media (min-width: 80rem)": 380,
    },
    overflow: "hidden",
    position: "absolute",
    top: "calc(100% + 2px)",
    transform: "translateX(-50%)",
    width: "100%",
  },
  panelHeader: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: "0.625rem",
    paddingInline: vars["--aui-space-12"],
  },
  panelHeaderText: { minWidth: 0 },
  panelEyebrow: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  panelSubtitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  countBadge: { flexShrink: 0 },
  list: { maxHeight: "26rem", paddingBottom: vars["--aui-space-8"], paddingInline: vars["--aui-space-8"] },
  loadingRow: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-12"],
  },
  emptyRow: { paddingBlock: vars["--aui-space-32"] },
  resultRow: {
    alignItems: "flex-start",
    borderRadius: vars["--aui-radius-control"],
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  resultIconBox: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    marginTop: vars["--aui-space-2"],
    width: 32,
  },
  resultIcon: { color: vars["--aui-color-text-muted"], height: 16, width: 16 },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  resultTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultSubtitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadge: { flexShrink: 0 },
});
