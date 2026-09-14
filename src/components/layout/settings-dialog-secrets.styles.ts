import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const secretsStyles = stylex.create({
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
  fieldLabel: {
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  fieldOptional: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-regular"],
    marginInlineStart: vars["--ads-space-4"],
  },
  /** Reproduces `space-y-1.5` between a label's text and its following block. */
  stacked: {
    marginBlockStart: vars["--ads-space-4"],
  },
  fieldControl: {
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-sm"],
  },
  fieldControlMono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-sm"],
  },
  valueRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  iconAction: {
    flexShrink: 0,
  },
  actionIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  hint: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontWeight: vars["--ads-font-weight-regular"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  hintCode: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    marginInline: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },
  descriptionArea: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-space-64"],
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
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  rowTitle: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowEnvVar: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },
  rowValue: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copiedIcon: {
    color: vars["--ads-color-success"],
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
