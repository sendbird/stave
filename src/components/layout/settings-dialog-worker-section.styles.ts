import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Per-provider Worker mode defaults form inside its settings card. */
export const workerSectionStyles = stylex.create({
  tabsList: {
    justifyContent: "flex-start",
    maxInlineSize: "100%",
    overflowX: "auto",
  },
  tabsTrigger: {
    flexShrink: 0,
  },
  tabIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  tabsContent: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
  },
  noEffortNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  resetStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  resetButton: {
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    blockSize: vars.controlHeightXs,
    paddingInline: vars.space8,
  },
  resetIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  instructionsTextarea: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  turnsInput: {
    inlineSize: "100%",
  },
  previewCard: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  previewTitle: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  previewWarning: {
    color: vars.colorWarningText,
    marginBlockStart: vars.space4,
  },
  previewLine: {
    marginBlockStart: vars.space4,
  },
});
