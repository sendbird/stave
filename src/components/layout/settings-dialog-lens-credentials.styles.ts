import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const lensCredentialsStyles = stylex.create({
  addButton: {
    gap: vars["--aui-space-4"],
  },
  addIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  notice: {
    alignItems: "start",
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
  },
  noticeIcon: {
    color: vars["--aui-color-success"],
    flexShrink: 0,
    blockSize: vars["--aui-control-icon-size-md"],
    marginBlockStart: vars["--aui-space-2"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  noticeText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
  },
  form: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
  },
  grid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  hostsField: {
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-8"],
  },
  hostRows: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  hostRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  hostInput: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-sm"],
  },
  removeHost: {
    flexShrink: 0,
  },
  removeHostIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  addHostButton: {
    gap: vars["--aui-space-4"],
    blockSize: vars["--aui-control-height-xs"],
  },
  addHostIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  hostHelp: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontWeight: vars["--aui-font-weight-regular"],
  },
  fieldLabel: {
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  fieldControl: {
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-sm"],
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginBlockStart: vars["--aui-space-4"],
  },
  autoFillRow: {
    alignItems: "start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  autoFillTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  autoFillDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  formActions: {
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
  },
  loadingRow: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-16"],
  },
  emptyText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-8"],
  },
  list: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  row: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
  },
  rowMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--aui-space-32"],
    justifyContent: "center",
    inlineSize: vars["--aui-space-32"],
  },
  rowMarkIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  rowBody: {
    flex: 1,
    minInlineSize: 0,
  },
  rowHostLine: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: vars["--aui-space-4"],
  },
  rowHost: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
  },
  rowUsername: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actionIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
});
