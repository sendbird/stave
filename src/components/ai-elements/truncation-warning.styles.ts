import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const truncationWarningStyles = stylex.create({
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorWarningBorder,
    backgroundColor: vars.colorWarningSoft,
    color: vars.colorWarningText,
  },
  bannerCompact: {
    paddingInline: vars.space8,
    paddingBlock: 6,
    fontSize: "0.75em",
  },
  bannerRegular: {
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: "0.875em",
  },
  icon: {
    marginTop: vars.space2,
    flexShrink: 0,
    width: vars.controlIconSizeMd,
    height: vars.controlIconSizeMd,
  },
  iconCompact: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  body: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
  },
  title: {
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    color: vars.colorText,
  },
  description: {
    lineHeight: vars.lineHeightTight,
    color: vars.colorTextMuted,
  },
});
