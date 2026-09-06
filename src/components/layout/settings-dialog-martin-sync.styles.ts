import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const martinSyncStyles = stylex.create({
  // Runtime-state badge tones (replaces the Tailwind classes returned by
  // `runtimeBadgeClass`). Each restates the border, fill, and text hue.
  badgeReady: {
    backgroundColor: vars.colorSuccessSoft,
    borderColor: vars.colorSuccessBorder,
    color: vars.colorSuccessText,
  },
  badgeIdle: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarningText,
  },
  badgeAttention: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    color: vars.colorDangerText,
  },
  scopeBadge: {
    textTransform: "capitalize",
  },
  panel: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  panelHeader: {
    alignItems: "flex-start",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    paddingBlock: vars.space16,
    paddingInline: vars.space20,
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: vars.controlHeightMd,
    justifyContent: "center",
    width: vars.controlHeightMd,
  },
  headerMarkIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleLine: {
    alignItems: "center",
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    rowGap: vars.space8,
  },
  headerTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  headerDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginTop: vars.space4,
  },
  refreshIcon: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  refreshIconSpinning: {
    animationDuration: vars.motionDurationLoop,
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  panelBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
    paddingBlock: vars.space16,
    paddingInline: vars.space20,
  },
  sectionTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  sectionDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginTop: vars.space4,
  },
  fieldGrid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  field: {
    display: "grid",
    gap: vars.space8,
  },
  fieldLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  scopeLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  pairRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars.space12,
  },
  pairInput: {
    "@media (min-width: 640px)": {
      maxWidth: "24rem",
    },
  },
  pairIcon: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  warning: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  scopeWarning: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorWarningText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  toggles: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    paddingTop: vars.space20,
  },
  outbox: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    columnGap: vars.space12,
    display: "flex",
    flexWrap: "wrap",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
    rowGap: vars.space12,
  },
  outboxIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  outboxText: {
    color: vars.colorTextMuted,
    flex: 1,
    fontSize: vars.fontSizeCaption,
    minWidth: 0,
  },
  outboxStrong: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  retryIcon: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
});
