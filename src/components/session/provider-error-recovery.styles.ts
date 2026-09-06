import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providerErrorRecoveryStyles = stylex.create({
  root: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    padding: vars.space12,
  },
  messageRow: {
    alignItems: "flex-start",
    color: vars.colorDangerText,
    display: "flex",
    gap: vars.space8,
  },
  messageIcon: {
    flexShrink: 0,
    height: vars.controlIconSizeSm,
    marginTop: vars.space2,
    width: vars.controlIconSizeSm,
  },
  message: {
    fontWeight: vars.fontWeightMedium,
  },
  guidance: {
    color: vars.colorTextMuted,
  },
  resume: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  help: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
  },
  error: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
  },
});
