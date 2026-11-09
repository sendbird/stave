import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * Rows publish whether they are the highlighted one, so the description can
 * show on that row alone: StyleX conditions only see the element they are
 * declared on, so the row's state reaches its subtitle through a variable.
 */
const ROW_HINT_DISPLAY = "--stavePaletteRowHintDisplay";

export const commandPaletteStyles = stylex.create({
  /** One-line rows fit a narrower dialog: title, the active row's hint, keys. */
  dialog: { maxWidth: "37.5rem" },
  /** 10-12 single-line rows on a laptop screen without crowding a short one. */
  frame: {
    blockSize: "min(76vh, 42rem)",
    display: "flex",
    flexDirection: "column",
    minBlockSize: 0,
  },
  /** The frame owns the height, so the list scrolls instead of capping at 18rem. */
  list: {
    flexGrow: 1,
    maxHeight: "none",
    minBlockSize: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  empty: {
    paddingBlock: vars["--aui-space-40"],
    paddingInline: vars["--aui-space-16"],
    textAlign: "left",
  },
  emptyTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  emptyHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    marginBlockEnd: 0,
    marginBlockStart: vars["--aui-space-4"],
  },
  group: { paddingBlock: vars["--aui-space-4"] },
  // One line at the 36px control step. The description is the highlighted
  // row's trailing hint only, so scanning stays one line per command.
  item: {
    [ROW_HINT_DISPLAY]: {
      default: "none",
      ":is([data-highlighted])": "block",
      ":is([data-selected=true])": "block",
    },
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minBlockSize: vars["--aui-control-height-md"],
    paddingBlock: 0,
    paddingInline: vars["--aui-space-12"],
  },
  itemIconBox: {
    alignItems: "center",
    blockSize: "1lh",
    display: "flex",
    flexShrink: 0,
    inlineSize: vars["--aui-space-20"],
    justifyContent: "center",
  },
  itemIconBoxMuted: { color: vars["--aui-color-text-muted"] },
  itemIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  itemBody: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  itemTitleRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 1,
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  itemTitle: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  extBadge: {
    letterSpacing: "0.12em",
    fontSize: vars["--aui-font-size-micro"],
    minBlockSize: 16,
    paddingInline: vars["--aui-space-4"],
    textTransform: "uppercase",
  },
  contextBadge: {
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "normal",
    minBlockSize: 16,
    paddingInline: 6,
  },
  itemSubtitle: {
    // The highlighted row's wash takes muted to 4.39:1 in light mode; a 20%
    // ink step keeps 12px subtitles above 4.5:1 on every row state.
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 20%, ${vars["--aui-color-text-muted"]})`,
    display: `var(${ROW_HINT_DISPLAY}, none)`,
    flexShrink: 1000,
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footer: {
    alignItems: "center",
    blockSize: 44,
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    lineHeight: "16px",
    paddingInline: vars["--aui-space-12"],
  },
  footerGroup: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  footerGroupTight: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  footerHint: {
    alignItems: "center",
    display: "inline-flex",
    gap: 6,
  },
  footerIcon: { blockSize: 12, inlineSize: 12 },
  pinButton: {
    blockSize: 28,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
    maxInlineSize: 224,
    paddingInline: vars["--aui-space-8"],
  },
  pinLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultCount: { flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  /** The task scope switch under the input: this workspace, or every repository. */
  scopeRow: {
    alignItems: "center",
    borderBlockEndColor: vars["--aui-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
  },
  scopeLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  scopeButtons: {
    display: "flex",
    gap: vars["--aui-space-4"],
  },
  searchHeading: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
  },
  searchNotice: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  searchTime: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    whiteSpace: "nowrap",
  },
});
