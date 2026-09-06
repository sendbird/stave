import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const commandDialogMarker = stylex.defineMarker();
export const commandItemMarker = stylex.defineMarker();
export const commandLayout = stylex.create({
  frame: { display: "flex", width: "100%", height: "100%", flexDirection: "column", overflow: "hidden" },
  palette: {
    top: "11vh", translate: "-50% 0", overflow: "hidden", borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline, borderStyle: "solid", borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceRaised, padding: 0,
    maxHeight: { default: null, "@media (min-width: 640px)": "78vh" },
  },
  inputRow: { display: "flex", height: 52, flexShrink: 0, alignItems: "center", gap: vars.space12, paddingInline: vars.space16 },
  searchIcon: { width: vars.space16, height: vars.space16, flexShrink: 0, color: vars.colorAccent },
  input: { height: "100%", minWidth: 0, flex: 1 },
  escape: {
    display: { default: "none", [stylex.when.ancestor(":is(*)", commandDialogMarker)]: "inline-flex" },
    height: vars.space20, alignItems: "center", borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline, borderStyle: "solid", borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas, paddingInline: 6, fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro, color: vars.colorTextMuted,
  },
  list: { scrollbarWidth: "none", maxHeight: "18rem", scrollPaddingBlock: vars.space8, overflowX: "hidden", overflowY: "auto", outlineStyle: "none" },
  group: { overflow: "hidden", padding: vars.space4 },
  separator: { marginInline: -4, height: 1, width: "auto", backgroundColor: vars.colorBorder },
  item: {
    pointerEvents: { default: null, ':is([data-disabled="true"])': "none" },
    opacity: { default: 1, ':is([data-disabled="true"])': vars.opacityDisabled },
    backgroundColor: { default: "transparent", ':is([data-selected="true"])': vars.colorSelectionFill },
    color: { default: null, ':is([data-selected="true"])': vars.colorText },
  },
  checkedIcon: {
    marginInlineStart: "auto",
    opacity: { default: 0, [stylex.when.ancestor(':is([data-checked="true"])', commandItemMarker)]: 1 },
    display: { default: null, [stylex.when.ancestor(':has([data-slot="command-shortcut"])', commandItemMarker)]: "none" },
  },
  shortcut: { marginInlineStart: "auto" },
});
