import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Per-provider model visibility switchboard in the Selector Models card. */
export const modelVisibilityStyles = stylex.create({
  emptyPanel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-12"],
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  panelHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  panelSummary: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  resetButton: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    blockSize: vars["--ads-control-height-sm"],
    paddingInline: vars["--ads-space-8"],
  },
  resetIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  list: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
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
      default: vars["--ads-color-border"],
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": 0,
    },
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    minBlockSize: vars["--ads-space-48"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  rowMain: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  rowIcon: {
    flexShrink: 0,
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  rowLabelWrap: {
    minInlineSize: 0,
  },
  rowLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowKey: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowBadge: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
  },
  rowSwitch: {
    flexShrink: 0,
  },
  tabsList: {
    inlineSize: "100%",
  },
  tabsTrigger: {
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height"],
  },
  tabIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  tabsContent: {
    paddingBlockStart: vars["--ads-space-4"],
  },
  titleResetButton: {
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    blockSize: vars["--ads-control-height-sm"],
    paddingInline: vars["--ads-space-8"],
  },
});
