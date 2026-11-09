import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Per-provider model visibility switchboard in the Selector Models card. */
export const modelVisibilityStyles = stylex.create({
  emptyPanel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-12"],
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  panelHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  panelSummary: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  resetButton: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    blockSize: vars["--aui-control-height-sm"],
    paddingInline: vars["--aui-space-8"],
  },
  resetIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  list: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    // A bare `<ul>` carries the UA `padding-inline-start: 40px` + list marker,
    // which indents every row's icon far past the section's content edge. Reset
    // both so the row's own `paddingInline` is the only inset.
    listStyle: "none",
    margin: 0,
    padding: 0,
    maxBlockSize: 320,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  listItem: {
    alignItems: "center",
    borderTopColor: {
      default: vars["--aui-color-border"],
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    minBlockSize: vars["--aui-space-48"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  rowMain: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  rowIcon: {
    flexShrink: 0,
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  rowLabelWrap: {
    minInlineSize: 0,
  },
  rowLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowKey: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowBadge: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
  },
  rowSwitch: {
    flexShrink: 0,
  },
  tabsContent: {
    paddingBlockStart: vars["--aui-space-4"],
  },
  titleResetButton: {
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    blockSize: vars["--aui-control-height-sm"],
    paddingInline: vars["--aui-space-8"],
  },
});
