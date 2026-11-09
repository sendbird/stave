import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Settings scope: the "Applying settings to" bar, notices and field badges. */
export const settingsScopeStyles = stylex.create({
  bar: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-32"],
    },
    rowGap: vars["--aui-space-4"],
  },
  sentence: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-4"],
    display: "inline-flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-body"],
  },
  hint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
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
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  popup: {
    inlineSize: "20rem",
    padding: vars["--aui-space-0"],
  },
  notice: {
    alignItems: "flex-start",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    marginBlockEnd: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  noticeText: {
    display: "flex",
    flex: "1 1 20rem",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  noticeTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  noticeDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },
  // Takes the parent's gap so wrapping fields keeps the card's rhythm.
  locked: {
    display: "flex",
    flexDirection: "column",
    gap: "inherit",
    opacity: vars["--aui-opacity-disabled"],
    userSelect: "none",
  },
  fieldStatus: {
    alignItems: "center",
    columnGap: vars["--aui-space-4"],
    display: "inline-flex",
    flexWrap: "wrap",
  },
});
