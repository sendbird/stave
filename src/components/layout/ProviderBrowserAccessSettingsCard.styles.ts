import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Provider browser-access status cards inside the Browser access settings card. */
export const providerBrowserAccessSettingsCardStyles = stylex.create({
  grid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  statusCard: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: 14,
  },
  statusHead: {
    alignItems: "center",
    display: "flex",
    gap: 10,
  },
  statusMark: {
    alignItems: "center",
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  statusIcon: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  statusBody: {
    flex: 1,
    minWidth: 0,
  },
  statusName: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  statusMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  statusDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space12,
  },
  statusSetup: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space8,
  },
  emphasis: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  domainsField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  domainsLabel: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  domainsHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  noteCard: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    paddingBlock: vars.space12,
    paddingInline: 14,
  },
  noteSpacer: {
    marginBlockStart: vars.space4,
  },
});
