import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const optionStyles = stylex.create({
  menu: { gap: vars.space8, padding: vars.space8 },
  list: { maxHeight: "13rem", display: "flex", flexDirection: "column", gap: vars.space2, overflowY: "auto" },
  toggle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars.space12, paddingInline: vars.space12, paddingBlock: vars.space8 },
  label: { display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: vars.space2 },
  title: { fontSize: vars.fontSizeBody, fontWeight: vars.fontWeightMedium, lineHeight: 1 },
  detail: { fontSize: vars.fontSizeMicro, lineHeight: "16px", color: vars.colorTextMuted },
  description: { fontSize: vars.fontSizeCaption, lineHeight: "16px", color: vars.colorTextMuted },
  section: { display: "flex", flexDirection: "column", gap: vars.space4, borderTopWidth: vars.borderWidthHairline, borderTopStyle: "solid", borderTopColor: vars.colorBorderSubtle, paddingTop: vars.space8 },
  sectionTitle: { paddingInline: vars.space4, fontSize: vars.fontSizeCaption, fontWeight: vars.fontWeightSemibold, color: vars.colorTextMuted },
  choice: {
    height: "auto", minHeight: 44, width: "100%", justifyContent: "flex-start", gap: vars.space8,
    borderRadius: vars.radiusControl, borderWidth: 0, paddingInline: 10, paddingBlock: vars.space8,
    textAlign: "start", whiteSpace: "normal",
    backgroundColor: { default: "transparent", ":hover": vars.colorSurfaceTint },
  },
  selected: { backgroundColor: { default: vars.colorSelectionFill, ":hover": vars.colorSelectionFill } },
  check: { width: 14, height: 14, flexShrink: 0, alignSelf: "flex-start" },
  selectedCheck: { color: vars.colorAccent },
  modelLabel: { display: "flex", minWidth: 0, flex: 1, flexDirection: "column" },
  truncated: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  modelCheck: { width: 14, height: 14, flexShrink: 0, color: vars.colorAccent },
  hint: { paddingInline: vars.space4, fontSize: vars.fontSizeMicro, lineHeight: "16px", color: vars.colorTextMuted },
  callout: { display: "flex", alignItems: "flex-start", gap: vars.space8, paddingInline: 10, paddingBlock: vars.space8, fontSize: vars.fontSizeCaption, lineHeight: "20px", color: vars.colorTextMuted },
  warning: { color: vars.colorWarningText, backgroundColor: vars.colorWarningSoft, borderRadius: vars.radiusControl },
  calloutIcon: { marginTop: vars.space2, width: 14, height: 14, flexShrink: 0 },
  calloutBody: { minWidth: 0, flex: 1 },
  settingsLink: {
    paddingInline: vars.space4, textAlign: "start", fontSize: vars.fontSizeMicro, lineHeight: "16px",
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    textUnderlineOffset: 2, textDecorationLine: { default: "none", ":hover": "underline" },
  },
});
