import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const developerStyles = stylex.create({
  // Provider timeout row
  timeoutRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "start",
    gap: vars.space12,
  },
  timeoutTrigger: {
    inlineSize: 160,
    borderRadius: vars.radiusControl,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  timeoutLabel: {
    paddingBlockStart: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  // Draft inputs
  binaryInput: {
    blockSize: vars.controlHeightLg,
    borderRadius: vars.radiusControl,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
  },
  tokenInput: {
    blockSize: vars.controlHeightLg,
    flex: 1,
    borderRadius: vars.radiusControl,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
  },
  // Notes / callouts
  note: {
    marginBlock: 0,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  warningNote: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorWarningBorder,
    backgroundColor: vars.colorWarningSoft,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  warningNoteParagraph: {
    marginBlock: 0,
  },
  warningNoteBody: {
    marginBlock: 0,
    marginBlockStart: vars.space4,
  },
  warningTitle: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  warningIcon: {
    inlineSize: vars.controlIconSizeMd,
    blockSize: vars.controlIconSizeMd,
    color: vars.colorWarning,
  },
  loadingCopy: {
    marginBlock: 0,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  // Button rows
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  actionButtonMd: {
    blockSize: vars.controlHeight,
  },
  actionButtonLg: {
    blockSize: vars.controlHeightLg,
  },
  actionButtonSm: {
    blockSize: vars.controlHeightSm,
  },
  actionButtonSmGap: {
    blockSize: vars.controlHeightSm,
    gap: vars.space4,
    fontSize: vars.fontSizeCaption,
  },
  actionButtonSmText: {
    blockSize: vars.controlHeightSm,
    fontSize: vars.fontSizeCaption,
  },
  pagerIcon: {
    inlineSize: vars.controlIconSizeSm,
    blockSize: vars.controlIconSizeSm,
  },
  // Info panel + rows
  infoPanel: {
    display: "grid",
    gap: vars.space4,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  infoPanelSpaced: {
    display: "grid",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    fontSize: vars.fontSizeBody,
  },
  infoLabel: {
    color: vars.colorTextMuted,
  },
  infoValueMono: {
    fontFamily: vars.fontMono,
    color: vars.colorText,
  },
  infoValueMonoMuted: {
    fontFamily: vars.fontMono,
    color: vars.colorTextMuted,
  },
  infoValueStrong: {
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  rowStack: {
    display: "grid",
    gap: vars.space4,
  },
  tokenFieldRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    gap: vars.space8,
  },
  tokenButtons: {
    display: "flex",
    gap: vars.space8,
  },
  // Plugin reload grid
  pluginGrid: {
    display: "grid",
    gap: vars.space8,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(4, minmax(0, 1fr))",
    },
  },
  pluginCell: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeBody,
  },
  pluginCellLabel: {
    marginBlock: 0,
    color: vars.colorTextMuted,
  },
  pluginCellValue: {
    marginBlock: 0,
    fontFamily: vars.fontMono,
    color: vars.colorText,
  },
  // Request log
  logHeaderRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "start",
    justifyContent: "space-between",
    gap: vars.space12,
  },
  logHeaderDetail: {
    maxInlineSize: "48rem",
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  logEmpty: {
    marginBlock: 0,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  logTableFrame: {
    overflow: "hidden",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  colTime: {
    inlineSize: 112,
  },
  colStatus: {
    inlineSize: 112,
  },
  cellTop: {
    verticalAlign: "top",
  },
  cellTopTime: {
    verticalAlign: "top",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  requestBadges: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  requestMeta: {
    marginBlock: 0,
    marginBlockStart: vars.space8,
    overflowWrap: "anywhere",
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  statusCell: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  statusDuration: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  statusError: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorDangerText,
  },
  tableFooter: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    borderBlockStartWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  tableFooterNote: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  // Payload cell
  payloadEmptyLabel: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  payloadFrame: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
  },
  payloadToggle: {
    display: "flex",
    inlineSize: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    textAlign: "left",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
  },
  payloadLoaderCell: {
    borderBlockStartWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  payloadPre: {
    marginBlock: 0,
    maxBlockSize: 256,
    overflow: "auto",
    borderBlockStartWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  payloadError: {
    borderBlockStartWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorDangerText,
  },
  loaderMuted: {
    color: vars.colorTextMuted,
  },
  // GPU status
  gpuStatusRows: {
    display: "grid",
    gap: vars.space4,
  },
});
