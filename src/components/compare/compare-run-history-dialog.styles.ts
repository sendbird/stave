import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

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
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-24"],
    paddingRight: vars["--ads-space-64"],
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
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
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.015em",
  },

  filters: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-24"],
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars["--ads-color-text-muted"],
    height: 16,
    insetInlineStart: vars["--ads-space-12"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 16,
  },
  searchInput: {
    height: 36,
    paddingInlineStart: vars["--ads-space-32"],
  },
  filterGroup: {
    display: "flex",
    gap: vars["--ads-space-4"],
    overflowX: "auto",
    paddingBottom: 2,
  },
  filterButton: {
    flexShrink: 0,
    gap: 6,
    height: 28,
    paddingInline: 10,
    fontSize: vars["--ads-font-size-caption"],
  },
  filterButtonActive: {
    color: vars["--ads-color-text"],
  },
  filterCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },

  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  listItem: {
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  rowButton: {
    alignItems: "flex-start",
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "left",
    width: "100%",
    [ROW_MARK_COLOR]: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  rowMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-selection-fill"],
    borderRadius: vars["--ads-radius-mark"],
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
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  rowTitle: {
    color: vars["--ads-color-text"],
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowPrompt: {
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    marginTop: vars["--ads-space-4"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  rowMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-12"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-micro"],
    marginTop: vars["--ads-space-8"],
    rowGap: vars["--ads-space-4"],
  },

  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
    minHeight: "14rem",
    paddingInline: vars["--ads-space-24"],
    textAlign: "center",
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-selection-fill"],
    borderRadius: vars["--ads-radius-full"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    marginTop: vars["--ads-space-12"],
  },
  emptyText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
    marginTop: vars["--ads-space-4"],
    maxWidth: "24rem",
  },
  clearButton: {
    marginTop: vars["--ads-space-16"],
  },

  footer: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-24"],
  },

  // Icons
  markIcon: { height: 18, width: 18 },
  statusIcon: { height: 14, width: 14 },
  statusIconDanger: { color: vars["--ads-color-danger"], height: 14, width: 14 },
  statusIconMuted: { color: vars["--ads-color-text-muted"], height: 14, width: 14 },
  statusIconSuccess: { color: vars["--ads-color-success-text"], height: 14, width: 14 },
  statusIconAccent: { color: vars["--ads-color-accent"], height: 14, width: 14 },
});
