import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Settings scope: the "Applying settings to" bar, notices and field badges. */
export const settingsScopeStyles = stylex.create({
  bar: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-32"],
    },
    rowGap: vars["--ads-space-4"],
  },
  sentence: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-4"],
    display: "inline-flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-body"],
  },
  hint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minInlineSize: 0,
  },
  trigger: {
    maxInlineSize: "20rem",
  },
  triggerLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chevron: {
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  popup: {
    inlineSize: "20rem",
    padding: vars["--ads-space-0"],
  },
  item: {
    alignItems: "flex-start",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  list: {
    maxBlockSize: "min(20rem, calc(var(--available-height) - 4rem))",
  },
  itemText: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minInlineSize: 0,
  },
  itemLabel: {
    color: vars["--ads-color-text"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  notice: {
    alignItems: "flex-start",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    marginBlockEnd: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  noticeText: {
    display: "flex",
    flex: "1 1 20rem",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  noticeTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  noticeDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  // Takes the parent's gap so wrapping fields keeps the card's rhythm.
  locked: {
    display: "flex",
    flexDirection: "column",
    gap: "inherit",
    opacity: vars["--ads-opacity-disabled"],
    userSelect: "none",
  },
  fieldStatus: {
    alignItems: "center",
    columnGap: vars["--ads-space-4"],
    display: "inline-flex",
    flexWrap: "wrap",
  },
});
