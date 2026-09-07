import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnEventDecisionStyles = stylex.create({
  /**
   * A multi-select question's own group box. `fieldset` is the semantic host
   * for a set of checkboxes that answer one question — it is what gives the
   * group an accessible name through its `legend` — and it draws no chrome
   * here: ADS's reset already zeroes the UA border and padding, and the
   * `Clarification` frame around it is the only containment this needs.
   */
  fieldset: {
    border: "none",
    display: "grid",
    gap: vars.space8,
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  /**
   * Matched to `field-anatomy`'s label row rather than invented: a question is
   * a field label, and a second type treatment beside the `RadioGroup` labels
   * in the same form would read as two kinds of question.
   */
  legend: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    padding: 0,
  },

  /* ─── System notice ───────────────────────────────────────────── */

  /**
   * A system notice is a labelled row, not a card: `agentSurface.bare` gives
   * it no fill, no perimeter and no radius, and this only supplies the row's
   * internal rhythm. §2's no-card rule applies to every kind on the rail, and
   * a tinted panel per notice would out-shout the tool rows beside it.
   */
  notice: {
    alignItems: "center",
    columnGap: vars.space8,
    display: "flex",
    minInlineSize: 0,
  },
  /*
   * Ink comes from `agentSurface.rowLabel`, composed before this key at the
   * call site: a notice line is the same row label as a `ToolRun` title.
   */
  noticeTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  /** The one semantic word, tone from `agentStatusWord`. No dot, no chip. */
  noticeStatus: {
    flex: "0 0 auto",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    whiteSpace: "nowrap",
  },
  noticeBody: {
    minInlineSize: 0,
  },
});
