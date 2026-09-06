import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Per-provider Worker mode defaults form inside its settings card. */
export const workerSectionStyles = stylex.create({
  tabsList: {
    justifyContent: "flex-start",
    maxWidth: "100%",
    overflowX: "auto",
  },
  tabsTrigger: {
    flexShrink: 0,
  },
  tabIcon: {
    height: 14,
    width: 14,
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
    gap: 6,
  },
  resetButton: {
    fontSize: vars.fontSizeCaption,
    gap: 6,
    height: 28,
    paddingInline: vars.space8,
  },
  resetIcon: {
    height: 14,
    width: 14,
  },
  instructionsTextarea: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  turnsInput: {
    width: "100%",
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
    paddingBlock: 10,
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
