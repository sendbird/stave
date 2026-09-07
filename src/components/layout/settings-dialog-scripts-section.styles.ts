import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const scriptsSectionStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  emptyState: {
    borderWidth: vars.borderWidthHairline,
    borderStyle: "dashed",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
  },
  emptyIcon: {
    inlineSize: vars.controlIconSizeMd,
    blockSize: vars.controlIconSizeMd,
  },
  projectLabel: {
    display: "flex",
    maxInlineSize: "28rem",
    flexDirection: "column",
    gap: vars.space4,
  },
  projectLabelText: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  triggerFull: {
    inlineSize: "100%",
  },
});
