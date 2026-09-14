import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const lensCredentialsStyles = stylex.create({
  addButton: {
    gap: vars["--ads-space-4"],
  },
  addIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  notice: {
    alignItems: "start",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
  },
  noticeIcon: {
    color: vars["--ads-color-success"],
    flexShrink: 0,
    blockSize: vars["--ads-control-icon-size-md"],
    marginBlockStart: vars["--ads-space-2"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  noticeText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
  form: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-12"],
  },
  grid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  hostsField: {
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
  },
  hostRows: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  hostRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  hostInput: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-sm"],
  },
  removeHost: {
    flexShrink: 0,
  },
  removeHostIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  addHostButton: {
    gap: vars["--ads-space-4"],
    blockSize: vars["--ads-control-height-xs"],
  },
  addHostIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  hostHelp: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontWeight: vars["--ads-font-weight-regular"],
  },
  fieldLabel: {
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  fieldControl: {
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-sm"],
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginBlockStart: vars["--ads-space-4"],
  },
  autoFillRow: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  autoFillTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  autoFillDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  formActions: {
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
  },
  loadingRow: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-16"],
  },
  emptyText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-8"],
  },
  list: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  row: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-12"],
  },
  rowMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--ads-space-32"],
    justifyContent: "center",
    inlineSize: vars["--ads-space-32"],
  },
  rowMarkIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  rowBody: {
    flex: 1,
    minInlineSize: 0,
  },
  rowHostLine: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: vars["--ads-space-4"],
  },
  rowHost: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
  },
  rowUsername: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actionIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
