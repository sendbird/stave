import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const secretsStyles = stylex.create({
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
  fieldLabel: {
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  fieldOptional: {
    color: vars["--aui-color-text-muted"],
    fontWeight: vars["--aui-font-weight-regular"],
    marginInlineStart: vars["--aui-space-4"],
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginBlockStart: vars["--aui-space-4"],
  },
  fieldControl: {
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-sm"],
  },
  fieldControlMono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-sm"],
  },
  valueRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  iconAction: {
    flexShrink: 0,
  },
  actionIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  hint: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontWeight: vars["--aui-font-weight-regular"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  hintCode: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    marginInline: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-4"],
  },
  descriptionArea: {
    fontSize: vars["--aui-font-size-caption"],
    minBlockSize: vars["--aui-space-64"],
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
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  rowTitle: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowEnvVar: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: vars["--aui-line-height-tight"],
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-4"],
  },
  rowValue: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copiedIcon: {
    color: vars["--aui-color-success"],
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
});
