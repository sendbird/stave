import * as stylex from "@stylexjs/stylex";
import { vars } from "../../../ads/tokens/tokens.stylex";

export const feedbackStyles = stylex.create({
  automation: { padding: vars["--ads-space-8"], flexShrink: 0, borderBottomWidth: vars["--ads-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"], backgroundColor: vars["--ads-color-canvas"] },
  preview: { display: "block", maxWidth: "100%", maxHeight: 240, objectFit: "contain", borderRadius: vars["--ads-radius-mark"] },
  comparison: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: vars["--ads-space-8"] },
  tray: { maxHeight: "45%", flexShrink: 0, overflow: "auto", borderTopWidth: vars["--ads-border-width-hairline"], borderTopStyle: "solid", borderTopColor: vars["--ads-color-border"], backgroundColor: vars["--ads-color-canvas"], padding: vars["--ads-space-12"] },
  header: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-8"] },
  headingGroup: { minWidth: 0 },
  title: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-semibold"] },
  subtitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-8"] },
  targets: { marginTop: vars["--ads-space-12"], display: "flex", flexWrap: "wrap", gap: vars["--ads-space-4"] },
  capture: { marginTop: vars["--ads-space-12"], display: "flex", alignItems: "flex-start", gap: vars["--ads-space-12"] },
  thumbnail: { maxHeight: 96, width: 96, flexShrink: 0, borderRadius: vars["--ads-radius-mark"], objectFit: "contain" },
  context: { minWidth: 0, flex: 1 },
  selector: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: vars["--ads-font-mono"], fontSize: vars["--ads-font-size-caption"] },
  excerpt: { marginTop: vars["--ads-space-4"], display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  explanation: { marginTop: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  sentComment: { marginTop: vars["--ads-space-12"], whiteSpace: "pre-wrap", fontSize: vars["--ads-font-size-body"] },
  editor: { marginTop: vars["--ads-space-12"], display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  editorActions: { display: "flex", gap: vars["--ads-space-8"] },
  hint: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
});
