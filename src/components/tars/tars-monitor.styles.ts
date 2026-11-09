import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * What the Tars run objects add around the design system's `RunMonitor` (card
 * and `variant="recap"`): the state tag's gap, the step-count readout, the attention line
 * in a card, and the "while you were away" header above the returned runs.
 * AUI tokens only.
 */
export const tarsMonitorStyles = stylex.create({
  count: { flexShrink: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], fontVariantNumeric: "tabular-nums" },
  stateTag: { flexShrink: 0, gap: vars["--aui-space-4"] },
  attentionMark: { flexShrink: 0 },
  attentionLabel: { flexShrink: 0, color: vars["--aui-color-warning-text"], fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"] },

  /** The recap is a section of the tray, not a card: its header, then the returned runs as lifted objects. */
  recap: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0,
    marginInline: vars["--aui-space-12"], marginBlockEnd: vars["--aui-space-12"], paddingBlockStart: vars["--aui-space-4"],
  },
  recapHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  recapHeading: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0 },
  /** The AUI #809 in-surface section title, as the lane headers below. */
  recapTitle: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"] },
  recapSince: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  recapCounts: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  recapList: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  recapMore: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"] },
});
