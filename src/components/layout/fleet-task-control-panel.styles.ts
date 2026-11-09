import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const controlPanelStyles = stylex.create({
  panel: {
    backgroundColor: vars["--aui-color-surface"],
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    outlineStyle: {
      default: null,
      ":focus": "none",
    },
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  headerText: {
    minWidth: 0,
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-2"],
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
  },
  /** Every control in this panel keeps a comfortable pointer target. */
  action: {
    minHeight: 36,
  },
  closeAction: {
    minHeight: 36,
    minWidth: 36,
  },
  actionIcon: {
    height: 14,
    width: 14,
  },
  closeIcon: {
    height: 16,
    width: 16,
  },
  stopIcon: {
    fill: "currentColor",
    height: 14,
    width: 14,
  },
  section: {
    marginTop: vars["--aui-space-12"],
  },
  staleNotice: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  replyCard: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    marginTop: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
  },
  replyLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  replyHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-2"],
  },
  replyInput: {
    backgroundColor: vars["--aui-color-canvas"],
    marginTop: vars["--aui-space-8"],
    minHeight: 80,
    resize: "vertical",
  },
  replyActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    marginTop: vars["--aui-space-8"],
  },
  managedNotice: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  turnFooter: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    marginTop: vars["--aui-space-12"],
    paddingTop: vars["--aui-space-12"],
  },
  turnText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
  },
  turnId: {
    fontFamily: vars["--aui-font-mono"],
  },
  status: {
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-8"],
    minHeight: 16,
  },
  statusNeutral: {
    color: vars["--aui-color-text-muted"],
  },
  statusSuccess: {
    color: vars["--aui-color-success-text"],
  },
  statusError: {
    color: vars["--aui-color-danger-text"],
  },
});
