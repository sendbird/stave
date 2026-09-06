import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Advisor default settings card controls. */
export const advisorSectionStyles = stylex.create({
  providerIcon: {
    height: 14,
    width: 14,
  },
  selector: {
    width: "100%",
  },
  trigger: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: vars.controlHeightLg,
    maxWidth: "none",
    paddingInline: vars.space12,
    width: "100%",
  },
  menu: {
    "@media (min-width: 640px)": {
      maxWidth: "32rem",
    },
  },
  invalidNote: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space8,
  },
  clampNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space8,
  },
  consultInput: {
    backgroundColor: vars.colorCanvas,
    height: vars.controlHeightLg,
    width: "6rem",
  },
  noteCard: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    paddingBlock: vars.space12,
    paddingInline: 14,
  },
  emphasis: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  noteSpacer: {
    marginBlockStart: vars.space4,
  },
});
