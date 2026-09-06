import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const inputGroupMarker = stylex.defineMarker();
export const layout = stylex.create({
  group: {
    position: "relative", minWidth: 0, width: "100%", alignItems: "center",
    height: { default: vars.controlHeightMd, ':has(>textarea, >[data-align="block-start"], >[data-align="block-end"])': "auto" },
    flexDirection: { default: "row", ':has(>[data-align="block-start"], >[data-align="block-end"])': "column" },
  },
  addon: {
    display: "flex", height: "auto", cursor: "text", alignItems: "center", justifyContent: "center",
    gap: vars.space8, paddingBlock: 6, fontSize: vars.fontSizeBody, fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted, userSelect: "none",
    opacity: { default: 1, [stylex.when.ancestor(':is([data-disabled="true"])', inputGroupMarker)]: vars.opacityDisabled },
  },
  inlineStart: {
    order: -9999, paddingLeft: vars.space8,
    marginLeft: { default: null, ":has(>button)": -4, ":has(>kbd)": "-0.15rem" },
  },
  inlineEnd: {
    order: 9999, paddingRight: vars.space8,
    marginRight: { default: null, ":has(>button)": -4, ":has(>kbd)": "-0.15rem" },
  },
  blockStart: { order: -9999, width: "100%", justifyContent: "flex-start", paddingInline: 10, paddingTop: vars.space8 },
  blockEnd: { order: 9999, width: "100%", justifyContent: "flex-start", paddingInline: 10, paddingBottom: vars.space8 },
  button: { display: "flex", alignItems: "center", gap: vars.space8, fontSize: vars.fontSizeBody, boxShadow: "none" },
  buttonXs: { height: 24, gap: vars.space4, paddingInline: 6 },
  buttonIconXs: { width: 24, height: 24, padding: 0 },
  buttonIconSm: { width: 32, height: 32, padding: 0 },
  text: { display: "flex", alignItems: "center", gap: vars.space8, fontSize: vars.fontSizeBody, color: vars.colorTextMuted },
  control: {
    flex: 1, borderRadius: 0, borderWidth: 0, backgroundColor: "transparent", boxShadow: "none",
  },
  input: {
    paddingTop: { default: null, [stylex.when.ancestor(':has(>[data-align="block-end"])', inputGroupMarker)]: vars.space12 },
    paddingBottom: { default: null, [stylex.when.ancestor(':has(>[data-align="block-start"])', inputGroupMarker)]: vars.space12 },
    paddingRight: { default: null, [stylex.when.ancestor(':has(>[data-align="inline-end"])', inputGroupMarker)]: 6 },
    paddingLeft: { default: null, [stylex.when.ancestor(':has(>[data-align="inline-start"])', inputGroupMarker)]: 6 },
  },
  textarea: { resize: "none", paddingBlock: vars.space8 },
  icon: { width: vars.space16, height: vars.space16, pointerEvents: "none" },
});
