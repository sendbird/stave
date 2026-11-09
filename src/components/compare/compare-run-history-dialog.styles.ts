import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * The row button publishes its hover colour into a custom property so the
 * leading status mark can shift to `colorText` on hover. StyleX conditions
 * only see the element they are declared on, so a parent-driven reveal travels
 * through a variable rather than a `group-hover` descendant selector.
 */
const ROW_MARK_COLOR = "--compareHistoryRowMarkColor";

export const compareRunHistoryDialogStyles = stylex.create({
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    height: "min(82vh, 44rem)",
    maxHeight: "82vh",
    maxWidth: "48rem",
    overflow: "hidden",
    padding: 0,
  },
  header: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-24"],
    paddingRight: vars["--aui-space-64"],
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-12"],
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    marginTop: 2,
    width: 36,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.015em",
  },

  filters: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-24"],
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars["--aui-color-text-muted"],
    height: 16,
    insetInlineStart: vars["--aui-space-12"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 16,
  },
  searchInput: {
    height: 36,
    paddingInlineStart: vars["--aui-space-32"],
  },

  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  listItem: {
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  rowButton: {
    alignItems: "flex-start",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
    textAlign: "left",
    width: "100%",
    [ROW_MARK_COLOR]: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
  },
  rowMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-selection-fill"],
    borderRadius: vars["--aui-radius-mark"],
    color: ROW_MARK_COLOR,
    display: "flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    marginTop: 2,
    width: 28,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  rowTitle: {
    color: vars["--aui-color-text"],
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowPrompt: {
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    marginTop: vars["--aui-space-4"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  rowMeta: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-8"],
    rowGap: vars["--aui-space-4"],
  },

  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
    minHeight: "14rem",
    paddingInline: vars["--aui-space-24"],
    textAlign: "center",
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-selection-fill"],
    borderRadius: vars["--aui-radius-full"],
    color: vars["--aui-color-text-muted"],
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    marginTop: vars["--aui-space-12"],
  },
  emptyText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "1.25rem",
    marginTop: vars["--aui-space-4"],
    maxWidth: "24rem",
  },
  clearButton: {
    marginTop: vars["--aui-space-16"],
  },

  footer: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-24"],
  },

  // Icons
  markIcon: { height: 18, width: 18 },
  statusIcon: { height: 14, width: 14 },
  statusIconDanger: { color: vars["--aui-color-danger"], height: 14, width: 14 },
  statusIconMuted: { color: vars["--aui-color-text-muted"], height: 14, width: 14 },
  statusIconSuccess: { color: vars["--aui-color-success-text"], height: 14, width: 14 },
  statusIconAccent: { color: vars["--aui-color-accent"], height: 14, width: 14 },
});
