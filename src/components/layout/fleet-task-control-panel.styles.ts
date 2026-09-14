import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const controlPanelStyles = stylex.create({
  panel: {
    backgroundColor: vars["--ads-color-surface"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    outlineStyle: {
      default: null,
      ":focus": "none",
    },
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  headerText: {
    minWidth: 0,
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
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
    marginTop: vars["--ads-space-12"],
  },
  staleNotice: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  replyCard: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    marginTop: vars["--ads-space-12"],
    padding: vars["--ads-space-12"],
  },
  replyLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  replyHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
  },
  replyInput: {
    backgroundColor: vars["--ads-color-canvas"],
    marginTop: vars["--ads-space-8"],
    minHeight: 80,
    resize: "vertical",
  },
  replyActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-8"],
  },
  managedNotice: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  turnFooter: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    marginTop: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-12"],
  },
  turnText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
  },
  turnId: {
    fontFamily: vars["--ads-font-mono"],
  },
  status: {
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-8"],
    minHeight: 16,
  },
  statusNeutral: {
    color: vars["--ads-color-text-muted"],
  },
  statusSuccess: {
    color: vars["--ads-color-success-text"],
  },
  statusError: {
    color: vars["--ads-color-danger-text"],
  },
});
