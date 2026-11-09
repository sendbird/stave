import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Transcript-owned composition around AUI `RunMonitor`; the monitor keeps its
 * own card and recap contracts.
 */
export const subagentCardStyles = stylex.create({
  // Subagents sit side by side and wrap into rows; each card keeps the
  // monitor's 360px class and never drops under the narrowest column.
  list: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 18rem), 1fr))",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  item: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  // The full exchange needs the reading column's width, so an open card takes the whole row.
  itemExpanded: { gridColumn: "1 / -1" },
  // Cards in one row share its height; their content stays at the top. Stave's
  // exchange rhythm: 12px between head, now well, body and footer, and a 12px
  // floor under the footer, where the AUI card packs 8px.
  monitor: { flex: "1 1 auto", alignContent: "start", gap: vars["--aui-space-12"], paddingBlockEnd: vars["--aui-space-12"] },
  // As in the exchange row: the identity sits a step under the title, and the
  // routed model keeps 8px from the identity it qualifies.
  meta: { display: "flex", alignItems: "center", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], flexWrap: "wrap", minWidth: 0, marginBlockStart: vars["--aui-space-4"] },
  trailing: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  summary: { margin: 0, fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-relaxed"], display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden", overflowWrap: "anywhere" },
  tileIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  chevron: { width: vars["--aui-control-icon-size-xs"], height: vars["--aui-control-icon-size-xs"] },
  icon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0, marginBlockStart: vars["--aui-space-2"] },
  history: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-caption"] },
  historyItem: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-8"], minWidth: 0, paddingInline: vars["--aui-space-8"] },
  historyText: { minWidth: 0, overflowWrap: "anywhere" },
  detail: { backgroundColor: vars["--aui-color-surface"], border: `${vars["--aui-border-width-hairline"]} solid ${vars["--aui-color-border"]}`, borderRadius: vars["--aui-radius-panel"], padding: vars["--aui-space-12"], minWidth: 0 },
  note: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"], paddingInline: vars["--aui-space-8"], margin: 0 },
});
