import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The "What Tars knows" and "Usage" sheets: read-mostly lists on the settings sheet's own rhythm. */
export const tarsInsightsStyles = stylex.create({
  /** Wider than the settings sheet from 640px so a row's bar and figures fit; the whole width below it. */
  sheet: {
    width: { default: "100%", "@media (min-width: 640px)": "75%" },
    maxWidth: { default: null, "@media (min-width: 640px)": "40rem" },
  },
  body: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-24"], minHeight: 0, minWidth: 0, overflowY: "auto",
    paddingInline: vars["--aui-space-16"], paddingBlockEnd: vars["--aui-space-24"],
  },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  sectionHead: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0 },
  sectionTitle: { margin: 0, fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-semibold"], lineHeight: vars["--aui-line-height-lead"] },
  note: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  error: { color: vars["--aui-color-danger-text"] },
  /** One thing Tars knows: a hairline above it instead of a card around it. */
  item: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, paddingBlockStart: vars["--aui-space-12"],
    borderTopWidth: vars["--aui-border-width-hairline"], borderTopStyle: "solid", borderTopColor: vars["--aui-color-border"],
  },
  /** The item's name with its edit action on the end; the action drops under a long name instead of squeezing it. */
  itemHead: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"], minWidth: 0 },
  itemTitle: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  /** Source and last-saved time, in one wrapping line. */
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  /** The user's own text, as written: line breaks kept, scrolled past a screenful. */
  quoted: {
    margin: 0, maxHeight: "16rem", overflowY: "auto", padding: vars["--aui-space-12"], borderRadius: vars["--aui-radius-control"],
    backgroundColor: vars["--aui-color-surface-tint"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"],
    whiteSpace: "pre-wrap", overflowWrap: "anywhere",
  },
  chips: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  /** A repository's accordion title: its name, then its path in what room is left. */
  repositoryTitle: { display: "flex", alignItems: "baseline", gap: vars["--aui-space-8"], minWidth: 0 },
  repositoryName: { flexShrink: 0, maxWidth: "100%", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  repositoryPath: { flex: "1 1 0", minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-regular"], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  repositoryBody: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0 },
  memoryList: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0 },
  subhead: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"] },

  /** Usage: the period switch with the report's time and Refresh on the end. */
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  toolbarEnd: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The period's totals: as many equal columns as fit, never narrower than a figure needs. */
  totals: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(6.5rem, 1fr))", gap: vars["--aui-space-12"], margin: 0, minWidth: 0 },
  total: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0 },
  totalLabel: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"] },
  totalValue: { margin: 0, fontSize: vars["--aui-font-size-heading"], fontWeight: vars["--aui-font-weight-semibold"], lineHeight: vars["--aui-line-height-heading"], fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" },
  totalMissing: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-regular"] },
  rows: { display: "flex", flexDirection: "column", minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  /** One work or model: its name, its bar, then its figures. */
  row: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, paddingBlock: vars["--aui-space-8"],
    borderTopWidth: vars["--aui-border-width-hairline"], borderTopStyle: "solid", borderTopColor: vars["--aui-color-border"],
  },
  rowHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: vars["--aui-space-12"], minWidth: 0 },
  rowName: { minWidth: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  /** A work's title is its opener; it wraps like the plain name beside it would. */
  rowOpen: { maxWidth: "100%", minWidth: 0, height: "auto", whiteSpace: "normal", textAlign: "start", overflowWrap: "anywhere" },
  rowPrimary: { flexShrink: 0, fontSize: vars["--aui-font-size-body"], fontVariantNumeric: "tabular-nums", lineHeight: vars["--aui-line-height-control"] },
  rowMeta: { display: "flex", flexWrap: "wrap", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], fontVariantNumeric: "tabular-nums" },
  rowMetaText: { minWidth: 0, overflowWrap: "anywhere" },
  notes: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
});
