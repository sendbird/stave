import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The live progress lines every Tars surface shares (tray card, flow block,
 * composer band, timeline): what the run is doing, how current that is, and
 * its recent progress. AUI tokens only; every line is the 13px interface row
 * (AUI #809 S2) on its 20px line, as the rest of Tars's secondary text.
 */
export const tarsLiveStyles = stylex.create({
  /** One status line: the activity, then how long ago it was observed. */
  line: {
    display: "flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, margin: 0,
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"],
  },
  /** Progress Stave has not observed for a while says so in the warning ink, never in the running color. */
  lineStale: { color: vars["--aui-color-warning-text"] },
  lineIcon: { flexShrink: 0, width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  lineText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  activity: { color: vars["--aui-color-text"] },
  age: { flexShrink: 0, fontVariantNumeric: "tabular-nums" },

  recent: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  recentTitle: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], fontWeight: vars["--aui-font-weight-medium"] },
  recentRow: {
    display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0,
    fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], color: vars["--aui-color-text"],
  },
  recentDot: { flexShrink: 0 },
  recentText: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  /** The tray card's history: the same 13px row in the muted ink, so it reads as history beside the live line. */
  recentTextCompact: { color: vars["--aui-color-text-muted"] },
  recentAge: { flexShrink: 0, color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums" },

  /** The composer band's running work: one block per running piece of work, above the message field. */
  strip: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, listStyle: "none",
    paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-8"] },
  stripRow: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-8"], minWidth: 0 },
  stripMark: { flexShrink: 0, marginBlockStart: vars["--aui-space-2"] },
  stripBody: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], flex: 1, minWidth: 0 },
  stripHead: { display: "flex", alignItems: "baseline", gap: vars["--aui-space-8"], minWidth: 0, margin: 0,
    fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  stripTitle: { flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"] },
  stripStage: { flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: vars["--aui-color-text-muted"] },
  stripActions: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], flexShrink: 0 },
  stripMore: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },

  /** The timeline's "Now" section: where the run stands before its stage history. */
  now: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  nowHead: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  nowStage: { minWidth: 0, margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },

  /** The sidebar's Tars entry: what runs and what needs the user, at the end of the row. */
  navStatus: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  navRunning: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-2"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"] },
});
