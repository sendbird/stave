import * as stylex from "@stylexjs/stylex";
import { vars } from "../../../ads/tokens/tokens.stylex";

export const feedbackStyles = stylex.create({
  tray: { maxHeight: "45%", flexShrink: 0, overflow: "auto", borderTopWidth: vars.borderWidthHairline, borderTopStyle: "solid", borderTopColor: vars.colorBorder, backgroundColor: vars.colorCanvas, padding: vars.space12 },
  header: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars.space8 },
  headingGroup: { minWidth: 0 },
  title: { fontSize: vars.fontSizeBody, fontWeight: vars.fontWeightSemibold },
  subtitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars.fontSizeCaption, color: vars.colorTextMuted },
  actions: { display: "flex", flexWrap: "wrap", gap: vars.space8 },
  targets: { marginTop: vars.space12, display: "flex", flexWrap: "wrap", gap: vars.space4 },
  capture: { marginTop: vars.space12, display: "flex", alignItems: "flex-start", gap: vars.space12 },
  thumbnail: { maxHeight: 96, width: 96, flexShrink: 0, borderRadius: vars.radiusMark, objectFit: "contain" },
  context: { minWidth: 0, flex: 1 },
  selector: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: vars.fontMono, fontSize: vars.fontSizeCaption },
  excerpt: { marginTop: vars.space4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: vars.fontSizeCaption, color: vars.colorTextMuted },
  explanation: { marginTop: vars.space4, fontSize: vars.fontSizeCaption, color: vars.colorTextMuted },
  sentComment: { marginTop: vars.space12, whiteSpace: "pre-wrap", fontSize: vars.fontSizeBody },
  editor: { marginTop: vars.space12, display: "flex", flexDirection: "column", gap: vars.space8 },
  editorActions: { display: "flex", gap: vars.space8 },
  hint: { fontSize: vars.fontSizeCaption, color: vars.colorTextMuted },
});
