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
  section: {
    paddingInline: vars.space20,
    paddingBlock: "0.875rem",
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
    gap: vars.space20,
    paddingBlock: vars.space8,
    fontSize: 13,
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
