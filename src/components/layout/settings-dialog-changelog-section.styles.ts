import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Rendered CHANGELOG.md article inside the Release notes settings card. */
export const changelogSectionStyles = stylex.create({
  article: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    maxWidth: "none",
  },
  h2: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.01em",
    marginBlockEnd: vars.space8,
    marginBlockStart: {
      default: vars.space24,
      ":first-child": 0,
    },
    paddingBlockEnd: vars.space8,
  },
  h3: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.14em",
    marginBlockEnd: vars.space4,
    marginBlockStart: vars.space16,
    textTransform: "uppercase",
  },
  ul: {
    listStyleType: "disc",
    marginBlock: vars.space8,
    paddingInlineStart: vars.space20,
    "::marker": {
      color: vars.colorTextSubtle,
    },
  },
  li: {
    lineHeight: vars.lineHeightRelaxed,
    marginBlock: vars.space4,
  },
  p: {
    lineHeight: vars.lineHeightRelaxed,
    marginBlock: vars.space8,
  },
  code: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
  },
  link: {
    color: vars.colorAccent,
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
    textUnderlineOffset: "2px",
  },
});
