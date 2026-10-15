import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

/** The model selector's account foot and group heading action; matches its "Show all" footer. */
export const modelPickerAccountStyles = stylex.create({
  footer: {
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: vars["--ads-space-2"],
    // The panel is a column; the foot stays at its bottom even when a tab is empty.
    marginBlockStart: "auto",
    padding: "0.375rem",
  },
  notice: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    minWidth: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: "0.625rem",
  },
  noticeIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-warning-text"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  noticeText: {
    color: vars["--ads-color-text-muted"],
    flexGrow: 1,
    fontSize: vars["--ads-font-size-caption"],
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
