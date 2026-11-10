import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * A decision card follows the AUI #809 scoped permission request (`Approval`
 * with `scopes`): a bounded ring + raised card the person acts on, the status
 * as a warning tag, and what changes where in one recessed well. Once answered
 * or invalid it folds to one line. The component itself is not used: a Tars
 * decision has no grant scope, no Deny (Not now leaves it waiting), key
 * choices, and an irreversible confirm that must never be a filled primary.
 */
export const tarsDecisionStyles = stylex.create({
  card: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, margin: 0,
    padding: vars["--aui-space-16"], boxSizing: "border-box",
    backgroundColor: vars["--aui-color-surface"], boxShadow: vars["--aui-elevation-raised"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"], color: vars["--aui-color-text"],
  },
  detail: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  option: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"], minWidth: 0 },
  /** Labels are short but may wrap at narrow widths; AUI keeps the control's minimum height and chrome. */
  optionButton: { justifyContent: "flex-start", maxWidth: "100%", minWidth: 0, paddingBlock: vars["--aui-space-4"], textAlign: "start", whiteSpace: "normal" },
  optionLabel: { minWidth: 0, overflowWrap: "anywhere" },
  keys: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], flexShrink: 0 },
  /** A confirmation's lead: what it does to which work, then its tags. */
  /** Narrow, the tags wrap under the heading instead of squeezing it. */
  confirmHeader: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-8"], minWidth: 0 },
  icon: { flexShrink: 0 },
  heading: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], flex: "1 1 14rem", minWidth: 0 },
  title: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-normal"], overflowWrap: "anywhere" },
  /** The work the decision is about, in full: it is what the user is confirming. */
  subtitle: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  tags: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"], flex: "0 1 auto", minWidth: 0, marginInlineStart: "auto" },
  /** Label left, value right, in the card's one recessed well (`agentSurface.well` owns its fill, padding and row gap). */
  rows: { margin: 0, gap: vars["--aui-space-4"] },
  row: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-2"], minWidth: 0 },
  rowLabel: { flex: "0 0 7rem", minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  /** The 13px interface row (AUI #809 S2). */
  rowValue: { flex: "1 1 12rem", minWidth: 0, margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  /** A request keeps its line breaks: a multi-line command must not read as one line. */
  rowValueLines: { whiteSpace: "pre-wrap" },
  /** Under a request cut to fit: that it was cut, and the task that shows it whole. */
  truncation: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"], marginBlockStart: vars["--aui-space-4"],
    color: vars["--aui-color-warning-text"], whiteSpace: "normal",
  },
  footer: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: vars["--aui-space-8"], minWidth: 0 },
  footerActions: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: vars["--aui-space-8"], marginInlineStart: "auto", minWidth: 0 },
  footerOptions: { display: "flex", minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  error: { margin: 0, color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-row"], overflowWrap: "anywhere" },
});
