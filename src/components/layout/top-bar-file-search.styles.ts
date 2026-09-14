import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * "Go to file" chrome for the top bar.
 *
 * The field is deliberately NOT `Command`'s palette input row: a palette input
 * is 52px tall by design and this one has to sit inside a 48px drag region, so
 * the row is composed here from the headless autocomplete input and owns its
 * own compact geometry.
 */
export const fileSearchStyles = stylex.create({
  // The top bar slot already caps the width; the field just fills it.
  root: { maxWidth: 380, minWidth: 0, position: "relative", width: "100%" },
  compactTrigger: {
    alignItems: "center",
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-canvas"],
    },
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    display: { default: "flex", "@media (min-width: 48rem)": "none" },
    height: 36,
    justifyContent: "center",
    padding: 0,
    width: 36,
  },
  compactTriggerHidden: { display: "none" },
  field: { display: { default: "none", "@media (min-width: 48rem)": "block" } },
  fieldExpanded: { display: "block" },
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
      default: vars["--ads-motion-duration-emphasis"],
      "@media (prefers-reduced-motion: reduce)": vars["--ads-motion-duration-micro"],
    },
    transitionProperty: "background-color, border-color, box-shadow",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  inputRowOpen: {
    borderColor: vars["--ads-color-border-focus"],
    boxShadow: `0 0 0 3px ${vars["--ads-color-accent-soft"]}`,
  },
  searchIcon: { color: vars["--ads-color-text-subtle"], flexShrink: 0, height: 14, width: 14 },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: vars["--ads-color-text"],
    flex: 1,
    fontFamily: vars["--ads-font-sans"],
    // The bar reads as one dense chrome row: Caption everywhere, including the
    // field's own text and placeholder. Body here made the search string a step
    // larger than every label beside it.
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    minWidth: 0,
    outlineStyle: "none",
    padding: 0,
    "::placeholder": { color: vars["--ads-color-text-placeholder"] },
  },
  panel: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-modal"],
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
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingBlock: "0.625rem",
    paddingInline: vars["--ads-space-12"],
  },
  panelHeaderText: { minWidth: 0 },
  panelEyebrow: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  panelSubtitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  countBadge: { flexShrink: 0 },
  list: { maxHeight: "26rem", paddingBottom: vars["--ads-space-8"], paddingInline: vars["--ads-space-8"] },
  loadingRow: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-12"],
  },
  emptyRow: { paddingBlock: vars["--ads-space-32"] },
  resultRow: {
    alignItems: "flex-start",
    borderRadius: vars["--ads-radius-control"],
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  resultIconBox: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    marginTop: vars["--ads-space-2"],
    width: 32,
  },
  resultIcon: { color: vars["--ads-color-text-muted"], height: 16, width: 16 },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  resultTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultSubtitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadge: { flexShrink: 0 },
});
