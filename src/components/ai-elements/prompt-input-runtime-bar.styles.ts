import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const runtimeBarStyles = stylex.create({
  rootBorder: {
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
  },
  sections: {
    display: "flex",
    flexDirection: "column",
  },
  // One gutter with the popover header (`space16`) so the section rules run
  // edge to edge on the flush surface and the labels sit on the header's own
  // inline baseline. `space20` here was the second inset that, on top of the
  // surface's surviving 16px padding, pushed the content 36px off the edge.
  section: {
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
  },
  sectionFirst: {
    borderTopWidth: 0,
  },
  sectionHeading: {
    marginBottom: 6,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: vars["--aui-color-text-muted"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  row: {
    display: "grid",
    minHeight: 36,
    gridTemplateColumns: "minmax(0,1fr) minmax(6rem,auto)",
    alignItems: "center",
    gap: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  term: {
    minWidth: 0,
    color: vars["--aui-color-text-muted"],
  },
  value: {
    maxWidth: "12rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "right",
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  valueWarning: {
    color: vars["--aui-color-warning-text"],
  },
});
