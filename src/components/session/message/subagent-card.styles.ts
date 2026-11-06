import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Transcript-owned composition; shared controls keep their ADS contracts. */
export const subagentCardStyles = stylex.create({
  tray: { backgroundColor: vars["--ads-color-canvas-subtle"], borderRadius: vars["--ads-radius-frame"], padding: vars["--ads-space-4"], width: "100%", maxWidth: "24rem", minWidth: 0, boxSizing: "border-box" },
  face: { backgroundColor: vars["--ads-color-surface"], border: `1px solid ${vars["--ads-color-border"]}`, borderRadius: vars["--ads-radius-panel"], minWidth: 0 },
  trigger: { display: "flex", flexDirection: "column", alignItems: "stretch", width: "100%", minWidth: 0, textAlign: "start", padding: vars["--ads-space-12"], gap: vars["--ads-space-12"], color: vars["--ads-color-text"] },
  head: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0, flexWrap: "wrap" },
  iconSlot: { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: vars["--ads-space-32"], height: vars["--ads-space-32"], border: `1px solid ${vars["--ads-color-border"]}`, borderRadius: vars["--ads-radius-control"], color: vars["--ads-color-text-muted"] },
  icon: { width: "1rem", height: "1rem", flexShrink: 0 },
  identity: { display: "flex", flexDirection: "column", flex: "1 1 8rem", gap: vars["--ads-space-4"], minWidth: 0, overflow: "hidden" },
  title: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"], lineHeight: vars["--ads-line-height-normal"], overflowWrap: "anywhere" },
  meta: { display: "flex", alignItems: "center", gap: vars["--ads-space-4"], flexWrap: "wrap", minWidth: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  preview: { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", overflowWrap: "anywhere", fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-regular"], lineHeight: vars["--ads-line-height-relaxed"] },
  foot: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], flexWrap: "wrap", fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"], fontWeight: vars["--ads-font-weight-regular"] },
  duration: { display: "inline-flex", alignItems: "center", gap: vars["--ads-space-4"], fontVariantNumeric: "tabular-nums" },
  disclosure: { marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: vars["--ads-space-4"], color: vars["--ads-color-text"] },
  liveBody: { paddingInline: vars["--ads-space-12"], paddingBlockEnd: vars["--ads-space-8"], display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  well: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], padding: vars["--ads-space-12"], backgroundColor: vars["--ads-color-canvas-subtle"], borderRadius: vars["--ads-radius-control"], minWidth: 0, fontSize: vars["--ads-font-size-caption"] },
  current: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  history: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  historyItem: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-8"], minWidth: 0 },
  historyText: { minWidth: 0, overflowWrap: "anywhere" },
  detail: { borderTop: `1px solid ${vars["--ads-color-border"]}`, padding: vars["--ads-space-12"], minWidth: 0 },
  actions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--ads-space-8"], paddingInline: vars["--ads-space-8"], paddingBlock: vars["--ads-space-4"] },
  note: { fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-text-muted"], textAlign: "center", paddingBlock: vars["--ads-space-4"], paddingInline: vars["--ads-space-8"], margin: 0 },
});
