import * as stylex from "@stylexjs/stylex";
import { vars } from "../../../ads/tokens/tokens.stylex";

export const chromeStyles = stylex.create({
  toolbar: { display: "flex", flexShrink: 0, flexDirection: "column", gap: vars.space8, borderBottomWidth: vars.borderWidthHairline, borderBottomStyle: "solid", borderBottomColor: vars.colorBorderSubtle, paddingInline: vars.space12, paddingBlock: vars.space8 },
  row: { display: "flex", alignItems: "center", gap: 6 },
  addressForm: { minWidth: 0, flex: 1 },
  address: { height: 36, overflow: "hidden", backgroundColor: { default: `color-mix(in oklch, ${vars.colorCanvas} 80%, transparent)`, ":focus-within": vars.colorCanvas }, transitionProperty: "background-color, border-color, box-shadow", transitionDuration: "200ms" },
  addressStart: { gap: 6, paddingLeft: 10, fontSize: vars.fontSizeBody, color: vars.colorTextMuted },
  addressInput: { backgroundColor: "transparent", fontSize: vars.fontSizeBody },
  addressEnd: { paddingRight: vars.space4 },
  compactIcon: { width: 14, height: 14 },
  modes: { display: "flex", flexShrink: 0, alignItems: "center", borderRadius: vars.radiusControl, borderWidth: vars.borderWidthHairline, borderStyle: "solid", borderColor: vars.colorBorderSubtle, backgroundColor: vars.colorCanvas, padding: vars.space2 },
  tab: { position: "relative" },
  count: { position: "absolute", right: -4, top: -4, minWidth: 14, borderRadius: 9999, backgroundColor: vars.colorAccent, paddingInline: vars.space4, fontSize: vars.fontSizeMicro, lineHeight: "14px", color: vars.colorAccentText },
  help: { maxWidth: "16rem", textWrap: "pretty" },
  captureButton: { height: 32, gap: vars.space4, paddingInline: vars.space8 },
  chevron: { width: vars.space12, height: vars.space12, opacity: 0.7 },
  captureMenu: { width: "11rem" },
  downloadsMenu: { width: "18rem" },
  downloadRow: { minWidth: 0 },
  downloadName: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  downloadSize: { marginLeft: vars.space8, flexShrink: 0, fontSize: vars.fontSizeMicro, color: vars.colorTextMuted },
  toolActive: { borderColor: vars.colorAccent, backgroundColor: { default: vars.colorAccentSoft, ":hover": vars.colorAccentSoft }, color: vars.colorAccent, boxShadow: vars.elevationRaised },
  toolInactive: { color: { default: vars.colorTextMuted, ":hover": vars.colorText } },
  toolIcon: { width: vars.space16, height: vars.space16 },
});
