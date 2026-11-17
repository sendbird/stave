import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const cleanupStyles = stylex.create({
  dialog: { width: "min(68rem, 94vw)", maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  toolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], flexWrap: "wrap" },
  actions: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], flexWrap: "wrap" },
  // Dialog footer alignment (trailing edge); the wider gap separates the reversible and destructive groups.
  // The row keeps its height while every action is hidden so the list does not jump on first selection.
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: vars["--aui-space-16"], minBlockSize: vars["--aui-control-height-sm"] },
  list: { height: "42vh", minHeight: "12rem", overflowY: "auto", borderBlockWidth: 1, borderBlockStyle: "solid", borderBlockColor: vars["--aui-color-border"] },
  heading: { paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-8"], backgroundColor: vars["--aui-color-surface"], color: vars["--aui-color-text"], fontWeight: 600 },
  row: { display: "flex", alignItems: "center", gap: vars["--aui-space-12"], padding: vars["--aui-space-8"], borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border"], minWidth: 0 },
  checkbox: { width: vars["--aui-control-height-xs"], height: vars["--aui-control-height-xs"], flexShrink: 0 },
  selected: { backgroundColor: vars["--aui-color-selection-fill"] },
  identity: { flex: 1, display: "grid", textAlign: "start", gap: vars["--aui-space-4"], minWidth: 0 },
  // What the host-layout quiet identity button computes to, for a blocked row that is not a control.
  identityStatic: { fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-regular"], lineHeight: "normal", color: vars["--aui-color-text-muted"] },
  srOnly: { position: "absolute", inlineSize: 1, blockSize: 1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", borderWidth: 0 },
  truncate: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  muted: { whiteSpace: "normal", overflowWrap: "anywhere", color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  status: { overflowWrap: "anywhere", fontSize: vars["--aui-font-size-caption"] },
  size: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontSize: vars["--aui-font-size-caption"] },
  history: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: vars["--aui-space-8"], borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border"] },
  recent: { maxHeight: "14vh", overflowY: "auto" },
  disclosure: { minHeight: vars["--aui-control-height-2xs"], lineHeight: vars["--aui-control-height-2xs"], cursor: "pointer" },
  shelf: { display: "grid", gap: vars["--aui-space-4"], paddingInline: vars["--aui-space-8"], paddingBlock: vars["--aui-space-4"] },
  rule: { display: "flex", alignItems: "center", gap: vars["--aui-space-12"], flexWrap: "wrap" },
  number: { width: "6rem" },
});
