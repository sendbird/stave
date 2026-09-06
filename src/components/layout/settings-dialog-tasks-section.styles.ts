import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Tasks (tracker) settings card layout. */
export const tasksSectionStyles = stylex.create({
  card: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  cardHeader: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    paddingBlock: vars.space16,
    paddingInline: vars.space20,
  },
  cardTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    paddingBlock: vars.space16,
    paddingInline: vars.space20,
  },
  hint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  hintSpaced: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space4,
  },
  field: {
    display: "grid",
    gap: vars.space8,
  },
  fieldLabel: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  triggerWide: {
    width: "16rem",
  },
  intervalInput: {
    width: "10rem",
  },
  sourcesCard: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    padding: vars.space16,
  },
  sourcesTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  sourceList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  sourceRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  sourceMain: {
    minWidth: 0,
  },
  sourceHead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  sourceLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  sourceBadge: {
    fontSize: vars.fontSizeCaption,
  },
  hintTight: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: 2,
  },
  sourceActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
  },
  setUpButton: {
    height: 32,
  },
  openIntegrations: {
    fontSize: vars.fontSizeCaption,
    height: "auto",
    paddingInline: 0,
  },
});
