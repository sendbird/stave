import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const conversationPlanCardStyles = stylex.create({
  root: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    paddingBlock: "0.625rem",
    paddingInline: vars.space16,
  },
  headerIcon: {
    color: vars.colorAccent,
    flexShrink: 0,
    height: vars.controlIconSizeSm,
    width: vars.controlIconSizeSm,
  },
  headerTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  body: {
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
});
