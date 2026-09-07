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
      default: vars.colorCanvas,
      ":hover": vars.colorCanvas,
    },
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
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
      default: vars.motionDurationEmphasis,
      "@media (prefers-reduced-motion: reduce)": vars.motionDurationMicro,
    },
    transitionProperty: "background-color, border-color, box-shadow",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  inputRowOpen: {
    borderColor: vars.colorBorderFocus,
    boxShadow: `0 0 0 3px ${vars.colorAccentSoft}`,
  },
  searchIcon: { color: vars.colorTextSubtle, flexShrink: 0, height: 14, width: 14 },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: vars.colorText,
    flex: 1,
    fontFamily: vars.fontSans,
    // The bar reads as one dense chrome row: Caption everywhere, including the
    // field's own text and placeholder. Body here made the search string a step
    // larger than every label beside it.
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    minWidth: 0,
    outlineStyle: "none",
    padding: 0,
    "::placeholder": { color: vars.colorTextPlaceholder },
  },
  panel: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationModal,
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
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: "0.625rem",
    paddingInline: vars.space12,
  },
  panelHeaderText: { minWidth: 0 },
  panelEyebrow: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  panelSubtitle: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  countBadge: { flexShrink: 0 },
  list: { maxHeight: "26rem", paddingBottom: vars.space8, paddingInline: vars.space8 },
  loadingRow: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    paddingBlock: vars.space16,
    paddingInline: vars.space12,
  },
  emptyRow: { paddingBlock: vars.space32 },
  resultRow: {
    alignItems: "flex-start",
    borderRadius: vars.radiusControl,
    gap: vars.space12,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  resultIconBox: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    marginTop: vars.space2,
    width: 32,
  },
  resultIcon: { color: vars.colorTextMuted, height: 16, width: 16 },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  resultTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultSubtitle: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadge: { flexShrink: 0 },
});
