import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The model selector's account foot and group heading action; matches its "Show all" footer. */
export const modelPickerAccountStyles = stylex.create({
  footer: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
    // The panel is a column; the foot stays at its bottom even when a tab is empty.
    marginBlockStart: "auto",
    padding: "0.375rem",
  },
  notice: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: "0.625rem",
  },
  noticeIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-warning-text"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  noticeText: {
    color: vars["--aui-color-text-muted"],
    flexGrow: 1,
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  link: {
    justifyContent: "flex-start",
    width: "100%",
  },
});
