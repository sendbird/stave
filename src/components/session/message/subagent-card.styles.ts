import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Transcript-owned composition; shared controls keep their AUI contracts. */
export const subagentCardStyles = stylex.create({
  tray: { backgroundColor: vars["--aui-color-canvas-subtle"], borderRadius: vars["--aui-radius-frame"], padding: vars["--aui-space-4"], width: "100%", maxWidth: "24rem", minWidth: 0, boxSizing: "border-box" },
  face: { backgroundColor: vars["--aui-color-surface"], border: `1px solid ${vars["--aui-color-border"]}`, borderRadius: vars["--aui-radius-panel"], minWidth: 0 },
  trigger: { display: "flex", flexDirection: "column", alignItems: "stretch", width: "100%", minWidth: 0, textAlign: "start", padding: vars["--aui-space-12"], gap: vars["--aui-space-12"], color: vars["--aui-color-text"] },
  head: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, flexWrap: "wrap" },
  iconSlot: { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: vars["--aui-space-32"], height: vars["--aui-space-32"], border: `1px solid ${vars["--aui-color-border"]}`, borderRadius: vars["--aui-radius-control"], color: vars["--aui-color-text-muted"] },
  icon: { width: "1rem", height: "1rem", flexShrink: 0 },
  identity: { display: "flex", flexDirection: "column", flex: "1 1 8rem", gap: vars["--aui-space-4"], minWidth: 0, overflow: "hidden" },
  title: { fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"], lineHeight: vars["--aui-line-height-normal"], overflowWrap: "anywhere" },
  meta: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], flexWrap: "wrap", minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  preview: { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", overflowWrap: "anywhere", fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-regular"], lineHeight: vars["--aui-line-height-relaxed"] },
  foot: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], flexWrap: "wrap", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"], fontWeight: vars["--aui-font-weight-regular"] },
  duration: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], fontVariantNumeric: "tabular-nums" },
  disclosure: { marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], color: vars["--aui-color-text"] },
  liveBody: { paddingInline: vars["--aui-space-12"], paddingBlockEnd: vars["--aui-space-8"], display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  well: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], padding: vars["--aui-space-12"], backgroundColor: vars["--aui-color-canvas-subtle"], borderRadius: vars["--aui-radius-control"], minWidth: 0, fontSize: vars["--aui-font-size-caption"] },
  current: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  history: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  historyItem: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-8"], minWidth: 0 },
  historyText: { minWidth: 0, overflowWrap: "anywhere" },
  detail: { borderTop: `1px solid ${vars["--aui-color-border"]}`, padding: vars["--aui-space-12"], minWidth: 0 },
  actions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--aui-space-8"], paddingInline: vars["--aui-space-8"], paddingBlock: vars["--aui-space-4"] },
  note: { fontSize: vars["--aui-font-size-micro"], color: vars["--aui-color-text-muted"], textAlign: "center", paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-8"], margin: 0 },
});
