import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const reviewDialogStyles = stylex.create({
  content: { gap: vars.space20, maxWidth: "32rem" },
  commitHash: { color: vars.colorText, fontFamily: vars.fontMono },
  legend: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    marginBottom: vars.space8,
  },
  option: {
    alignItems: "flex-start",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    minHeight: 48,
    // Replaces the `space-y-2` stack: every option but the first owes the one
    // above it a gap, and the legend already carries its own bottom margin.
    marginTop: { default: vars.space8, ":first-of-type": 0 },
    paddingBlock: 10,
    paddingInline: vars.space12,
  },
  optionEnabled: {
    backgroundColor: { default: "transparent", ":hover": vars.colorOverlayHover },
    cursor: "pointer",
  },
  optionDisabled: { cursor: "not-allowed", opacity: vars.opacityDisabled },
  optionSelected: {
    backgroundColor: {
      default: vars.colorAccentSoft,
      ":hover": vars.colorSelectionFill,
    },
    borderColor: vars.colorAccent,
  },
  optionMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    marginTop: vars.space2,
    width: 24,
  },
  optionMarkSelected: {
    backgroundColor: vars.colorAccentSoft,
    color: vars.colorAccent,
  },
  optionIcon: { height: 14, width: 14 },
  optionText: { minWidth: 0 },
  optionTitle: {
    color: vars.colorText,
    display: "block",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  optionDescription: {
    color: vars.colorTextMuted,
    display: "block",
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    marginTop: vars.space2,
  },
  summaryField: { display: "flex", flexDirection: "column", gap: vars.space8 },
  summaryLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  helpText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    minHeight: 20,
  },
  helpTextError: { color: vars.colorDangerText },
});
