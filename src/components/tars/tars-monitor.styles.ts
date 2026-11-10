import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * What the Tars run objects add around the design system's `RunMonitor` card:
 * the state tag's gap, the step-count readout and the attention line in a
 * card. AUI tokens only.
 */
export const tarsMonitorStyles = stylex.create({
  count: { flexShrink: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], fontVariantNumeric: "tabular-nums" },
  stateTag: { flexShrink: 0, gap: vars["--aui-space-4"] },
  /**
   * The footer's view links (request, timeline) as one group. Beside the
   * actions the footer's spacer already pushes it to the end; when a long
   * confirmation wraps it to its own line, its auto margin keeps it there.
   */
  views: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], flexShrink: 0, marginInlineStart: "auto" },
  attentionMark: { flexShrink: 0 },
  /** The attention item's label line: the 13px row in the warning ink and medium weight, above the item's own text. */
  attentionLabel: {
    minWidth: 0, color: vars["--aui-color-warning-text"], fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere",
  },

});
