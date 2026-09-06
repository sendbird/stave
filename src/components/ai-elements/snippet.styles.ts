import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const snippetStyles = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 30%, transparent)`,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  prefix: {
    userSelect: "none",
    borderRightWidth: vars.borderWidthHairline,
    borderRightStyle: "solid",
    borderRightColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
    color: vars.colorTextMuted,
  },
  code: {
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
  },
  copyButton: {
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  copiedIcon: {
    width: 12,
    height: 12,
    color: vars.colorAccent,
  },
  copyIcon: {
    width: 12,
    height: 12,
  },
});
