import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const inputGroupMarker = stylex.defineMarker();
export const layout = stylex.create({
  group: {
    position: "relative", minWidth: 0, width: "100%", alignItems: "center",
    height: { default: vars["--ads-control-height-md"], ':has(>textarea, >[data-align="block-start"], >[data-align="block-end"])': "auto" },
    flexDirection: { default: "row", ':has(>[data-align="block-start"], >[data-align="block-end"])': "column" },
  },
  addon: {
    display: "flex", height: "auto", cursor: "text", alignItems: "center", justifyContent: "center",
    gap: vars["--ads-space-8"], paddingBlock: 6, fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"], userSelect: "none",
    opacity: { default: 1, [stylex.when.ancestor(':is([data-disabled="true"])', inputGroupMarker)]: vars["--ads-opacity-disabled"] },
  },
  inlineStart: {
    order: -9999, paddingLeft: vars["--ads-space-8"],
    marginLeft: { default: null, ":has(>button)": -4, ":has(>kbd)": "-0.15rem" },
  },
  inlineEnd: {
    order: 9999, paddingRight: vars["--ads-space-8"],
    marginRight: { default: null, ":has(>button)": -4, ":has(>kbd)": "-0.15rem" },
  },
  blockStart: { order: -9999, width: "100%", justifyContent: "flex-start", paddingInline: 10, paddingTop: vars["--ads-space-8"] },
  blockEnd: { order: 9999, width: "100%", justifyContent: "flex-start", paddingInline: 10, paddingBottom: vars["--ads-space-8"] },
  button: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], fontSize: vars["--ads-font-size-body"], boxShadow: "none" },
  buttonXs: { height: 24, gap: vars["--ads-space-4"], paddingInline: 6 },
  buttonIconXs: { width: 24, height: 24, padding: 0 },
  buttonIconSm: { width: 32, height: 32, padding: 0 },
  text: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], fontSize: vars["--ads-font-size-body"], color: vars["--ads-color-text-muted"] },
  control: {
    flex: 1, borderRadius: 0, borderWidth: 0, backgroundColor: "transparent", boxShadow: "none",
  },
  input: {
    paddingTop: { default: null, [stylex.when.ancestor(':has(>[data-align="block-end"])', inputGroupMarker)]: vars["--ads-space-12"] },
    paddingBottom: { default: null, [stylex.when.ancestor(':has(>[data-align="block-start"])', inputGroupMarker)]: vars["--ads-space-12"] },
    paddingRight: { default: null, [stylex.when.ancestor(':has(>[data-align="inline-end"])', inputGroupMarker)]: 6 },
    paddingLeft: { default: null, [stylex.when.ancestor(':has(>[data-align="inline-start"])', inputGroupMarker)]: 6 },
  },
  textarea: { resize: "none", paddingBlock: vars["--ads-space-8"] },
  icon: { width: vars["--ads-space-16"], height: vars["--ads-space-16"], pointerEvents: "none" },
});
