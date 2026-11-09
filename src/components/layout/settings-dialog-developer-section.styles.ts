import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const developerStyles = stylex.create({
  // Provider timeout row
  timeoutRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "start",
    gap: vars["--aui-space-12"],
  },
  timeoutTrigger: {
    inlineSize: 160,
    borderRadius: vars["--aui-radius-control"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  timeoutLabel: {
    paddingBlockStart: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  // Draft inputs
  binaryInput: {
    blockSize: vars["--aui-control-height-lg"],
    borderRadius: vars["--aui-radius-control"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
  },
  tokenInput: {
    blockSize: vars["--aui-control-height-lg"],
    flex: 1,
    borderRadius: vars["--aui-radius-control"],
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
  },
  // Notes / callouts
  note: {
    marginBlock: 0,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  warningNote: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-warning-border"],
    backgroundColor: vars["--aui-color-warning-soft"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  warningNoteParagraph: {
    marginBlock: 0,
  },
  warningNoteBody: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-4"],
  },
  warningTitle: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  warningIcon: {
    inlineSize: vars["--aui-control-icon-size-md"],
    blockSize: vars["--aui-control-icon-size-md"],
    color: vars["--aui-color-warning"],
  },
  loadingCopy: {
    marginBlock: 0,
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  // Button rows
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  actionButtonMd: {
    blockSize: vars["--aui-control-height"],
  },
  actionButtonLg: {
    blockSize: vars["--aui-control-height-lg"],
  },
  actionButtonSm: {
    blockSize: vars["--aui-control-height-sm"],
  },
  actionButtonSmGap: {
    blockSize: vars["--aui-control-height-sm"],
    gap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
  },
  actionButtonSmText: {
    blockSize: vars["--aui-control-height-sm"],
    fontSize: vars["--aui-font-size-caption"],
  },
  pagerIcon: {
    inlineSize: vars["--aui-control-icon-size-sm"],
    blockSize: vars["--aui-control-icon-size-sm"],
  },
  // Info panel + rows
  infoPanel: {
    display: "grid",
    gap: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  infoPanelSpaced: {
    display: "grid",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"],
  },
  infoLabel: {
    color: vars["--aui-color-text-muted"],
  },
  infoValueMono: {
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text"],
  },
  infoValueMonoMuted: {
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text-muted"],
  },
  infoValueStrong: {
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  rowStack: {
    display: "grid",
    gap: vars["--aui-space-4"],
  },
  tokenFieldRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    gap: vars["--aui-space-8"],
  },
  tokenButtons: {
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  // Plugin reload grid
  pluginGrid: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(4, minmax(0, 1fr))",
    },
  },
  pluginCell: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
  },
  pluginCellLabel: {
    marginBlock: 0,
    color: vars["--aui-color-text-muted"],
  },
  pluginCellValue: {
    marginBlock: 0,
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text"],
  },
  // Request log
  logHeaderRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "start",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
  },
  logHeaderDetail: {
    maxInlineSize: "48rem",
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  logEmpty: {
    marginBlock: 0,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  logTableFrame: {
    overflow: "hidden",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
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
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  requestBadges: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  requestMeta: {
    marginBlock: 0,
    marginBlockStart: vars["--aui-space-8"],
    overflowWrap: "anywhere",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  statusCell: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  statusDuration: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  statusError: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-danger-text"],
  },
  tableFooter: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  tableFooterNote: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  // Payload cell
  payloadEmptyLabel: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  payloadFrame: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
  },
  payloadToggle: {
    display: "flex",
    inlineSize: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    textAlign: "left",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
  },
  payloadLoaderCell: {
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  payloadPre: {
    marginBlock: 0,
    maxBlockSize: 256,
    overflow: "auto",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  payloadError: {
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-danger-text"],
  },
  loaderMuted: {
    color: vars["--aui-color-text-muted"],
  },
  // GPU status
  gpuStatusRows: {
    display: "grid",
    gap: vars["--aui-space-4"],
  },
});
