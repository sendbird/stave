import * as stylex from "@stylexjs/stylex";
import { vars } from "../../../aui/tokens/tokens.stylex";

export const feedbackStyles = stylex.create({
  automation: { padding: vars["--aui-space-8"], flexShrink: 0, borderBottomWidth: vars["--aui-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border"], backgroundColor: vars["--aui-color-canvas"] },
  preview: { display: "block", maxWidth: "100%", maxHeight: 240, objectFit: "contain", borderRadius: vars["--aui-radius-mark"] },
  tray: { maxHeight: "45%", flexShrink: 0, overflow: "auto", borderTopWidth: vars["--aui-border-width-hairline"], borderTopStyle: "solid", borderTopColor: vars["--aui-color-border"], backgroundColor: vars["--aui-color-canvas"], padding: vars["--aui-space-12"] },
  header: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"] },
  headingGroup: { minWidth: 0 },
  title: { fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"] },
  subtitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"] },
  targets: { marginTop: vars["--aui-space-12"], display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"] },
  capture: { marginTop: vars["--aui-space-12"], display: "flex", alignItems: "flex-start", gap: vars["--aui-space-12"] },
  thumbnail: { maxHeight: 96, width: 96, flexShrink: 0, borderRadius: vars["--aui-radius-mark"], objectFit: "contain" },
  context: { minWidth: 0, flex: 1 },
  selector: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"] },
  excerpt: { marginTop: vars["--aui-space-4"], display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  explanation: { marginTop: vars["--aui-space-4"], fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  sentComment: { marginTop: vars["--aui-space-12"], whiteSpace: "pre-wrap", fontSize: vars["--aui-font-size-body"] },
  editor: { marginTop: vars["--aui-space-12"], display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  editorActions: { display: "flex", gap: vars["--aui-space-8"] },
  hint: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  record: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  compareImage: { display: "block", width: "100%", height: "100%", objectFit: "contain" },
  verdict: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], margin: 0, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text"] },
  verdictIcon: { width: 14, height: 14, flexShrink: 0, color: vars["--aui-color-text-muted"] },
});
