import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const runtimeBarStyles = stylex.create({
  rootBorder: {
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
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
    paddingInline: vars.space16,
    paddingBlock: vars.space12,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
  },
  sectionFirst: {
    borderTopWidth: 0,
  },
  sectionHeading: {
    marginBottom: 6,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: vars.colorTextMuted,
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
    gap: vars.space16,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorderSubtle,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  term: {
    minWidth: 0,
    color: vars.colorTextMuted,
  },
  value: {
    maxWidth: "12rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "right",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  valueWarning: {
    color: vars.colorWarningText,
  },
});
