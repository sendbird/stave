import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const developerStyles = stylex.create({
  // Provider timeout row
  timeoutRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "start",
    gap: vars["--ads-space-12"],
  },
  timeoutTrigger: {
    inlineSize: 160,
    borderRadius: vars["--ads-radius-control"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  timeoutLabel: {
    paddingBlockStart: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  // Draft inputs
  binaryInput: {
    blockSize: vars["--ads-control-height-lg"],
    borderRadius: vars["--ads-radius-control"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
  },
  tokenInput: {
    blockSize: vars["--ads-control-height-lg"],
    flex: 1,
    borderRadius: vars["--ads-radius-control"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
  },
  // Notes / callouts
  note: {
    marginBlock: 0,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  warningNote: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-warning-border"],
    backgroundColor: vars["--ads-color-warning-soft"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  warningNoteParagraph: {
    marginBlock: 0,
  },
  warningNoteBody: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-4"],
  },
  warningTitle: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  warningIcon: {
    inlineSize: vars["--ads-control-icon-size-md"],
    blockSize: vars["--ads-control-icon-size-md"],
    color: vars["--ads-color-warning"],
  },
  loadingCopy: {
    marginBlock: 0,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  // Button rows
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  actionButtonMd: {
    blockSize: vars["--ads-control-height"],
  },
  actionButtonLg: {
    blockSize: vars["--ads-control-height-lg"],
  },
  actionButtonSm: {
    blockSize: vars["--ads-control-height-sm"],
  },
  actionButtonSmGap: {
    blockSize: vars["--ads-control-height-sm"],
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
  },
  actionButtonSmText: {
    blockSize: vars["--ads-control-height-sm"],
    fontSize: vars["--ads-font-size-caption"],
  },
  pagerIcon: {
    inlineSize: vars["--ads-control-icon-size-sm"],
    blockSize: vars["--ads-control-icon-size-sm"],
  },
  // Info panel + rows
  infoPanel: {
    display: "grid",
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  infoPanelSpaced: {
    display: "grid",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"],
  },
  infoLabel: {
    color: vars["--ads-color-text-muted"],
  },
  infoValueMono: {
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text"],
  },
  infoValueMonoMuted: {
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text-muted"],
  },
  infoValueStrong: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  rowStack: {
    display: "grid",
    gap: vars["--ads-space-4"],
  },
  tokenFieldRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    gap: vars["--ads-space-8"],
  },
  tokenButtons: {
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  // Plugin reload grid
  pluginGrid: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(4, minmax(0, 1fr))",
    },
  },
  pluginCell: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
  },
  pluginCellLabel: {
    marginBlock: 0,
    color: vars["--ads-color-text-muted"],
  },
  pluginCellValue: {
    marginBlock: 0,
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text"],
  },
  // Request log
  logHeaderRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "start",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
  },
  logHeaderDetail: {
    maxInlineSize: "48rem",
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  logEmpty: {
    marginBlock: 0,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  logTableFrame: {
    overflow: "hidden",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
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
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  requestBadges: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  requestMeta: {
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-8"],
    overflowWrap: "anywhere",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  statusCell: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  statusDuration: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  statusError: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
  tableFooter: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  tableFooterNote: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  // Payload cell
  payloadEmptyLabel: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  payloadFrame: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
  },
  payloadToggle: {
    display: "flex",
    inlineSize: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    textAlign: "left",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  payloadLoaderCell: {
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  payloadPre: {
    marginBlock: 0,
    maxBlockSize: 256,
    overflow: "auto",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  payloadError: {
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
  loaderMuted: {
    color: vars["--ads-color-text-muted"],
  },
  // GPU status
  gpuStatusRows: {
    display: "grid",
    gap: vars["--ads-space-4"],
  },
});
