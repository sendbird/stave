import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const delegationStyles = stylex.create({
  panel: {
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorTextMuted,
  },
  panelHeading: {
    marginBlock: 0,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  emphasis: {
    color: vars.colorText,
  },
  list: {
    marginBlock: 0,
    marginBlockStart: vars.space4,
    paddingInlineStart: 0,
    listStyle: "none",
    display: "grid",
    gap: vars.space4,
  },
  paragraphSpaced: {
    marginBlock: 0,
    marginBlockStart: vars.space8,
  },
  paragraphTight: {
    marginBlock: 0,
    marginBlockStart: vars.space4,
  },
  detailList: {
    marginBlock: 0,
    marginBlockStart: vars.space8,
    paddingInlineStart: 0,
    listStyle: "none",
    display: "grid",
    gap: vars.space4,
  },
  openSettingsLink: {
    marginBlockStart: vars.space4,
    display: "block",
    textAlign: "left",
    fontSize: vars.fontSizeCaption,
    textUnderlineOffset: 2,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
  },
  code: {
    marginInline: vars.space4,
    borderRadius: vars.radiusMark,
    backgroundColor: vars.colorCanvasSubtle,
    paddingInline: vars.space4,
    paddingBlock: vars.space2,
    fontSize: vars.fontSizeMicro,
    color: vars.colorText,
  },
  codeInline: {
    borderRadius: vars.radiusMark,
    backgroundColor: vars.colorCanvasSubtle,
    paddingInline: vars.space4,
    paddingBlock: vars.space2,
    fontSize: vars.fontSizeMicro,
    color: vars.colorText,
  },
  requiredTag: {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
});
