import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const contextMeterStyles = stylex.create({
  trigger: {
    height: 32,
    gap: 6,
    paddingInline: vars["--aui-space-8"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
  },
  track: {
    height: 6,
    width: 32,
    overflow: "hidden",
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-track"],
  },
  fill: {
    display: "block",
    height: "100%",
    borderRadius: vars["--aui-radius-full"],
  },
  fillOk: { backgroundColor: vars["--aui-color-success-border"] },
  fillWarn: { backgroundColor: vars["--aui-color-warning"] },
  fillDanger: { backgroundColor: vars["--aui-color-danger"] },
  percent: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  tokens: { display: { default: "inline", "@container composer (max-width: 480px)": "none" } },
  narrowPercent: { display: { default: "none", "@container composer (max-width: 480px)": "inline" } },
  popover: {
    width: "16rem",
    gap: 0,
    padding: vars["--aui-space-12"],
  },
  popoverTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: vars["--aui-font-size-body"],
  },
  titleIcon: { width: "0.875rem", height: "0.875rem" },
  popoverDescription: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
  },
  metricsList: {
    marginTop: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
  },
  metricTerm: { color: vars["--aui-color-text-muted"] },
  metricValue: {
    textAlign: "right",
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  /*
   * Composition: the same caption size and term/value inks as the totals
   * above it. Every row reserves the chevron column, so a label that expands
   * and one that does not start on one edge.
   */
  breakdown: {
    marginTop: vars["--aui-space-12"],
    paddingTop: vars["--aui-space-12"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
  },
  breakdownHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  breakdownTitle: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  breakdownProvider: {
    color: vars["--aui-color-text-muted"],
    whiteSpace: "nowrap",
  },
  breakdownList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minWidth: 0,
  },
  breakdownExpandable: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  breakdownRow: {
    display: "grid",
    gridTemplateColumns: `${vars["--aui-space-16"]} minmax(0, 1fr) auto`,
    alignItems: "center",
    columnGap: vars["--aui-space-4"],
    minWidth: 0,
    width: "100%",
  },
  breakdownToggle: {
    borderRadius: vars["--aui-radius-control"],
    color: "inherit",
    textAlign: "start",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
  },
  breakdownGutter: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars["--aui-color-text-muted"],
  },
  breakdownChevron: {
    width: "0.875rem",
    height: "0.875rem",
  },
  breakdownChevronOpen: { transform: "rotate(90deg)" },
  breakdownLabel: {
    color: vars["--aui-color-text-muted"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  breakdownItemLabel: {
    color: vars["--aui-color-text-subtle"],
    fontFamily: vars["--aui-font-mono"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  breakdownValue: {
    textAlign: "right",
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  breakdownItems: {
    paddingInlineStart: vars["--aui-space-12"],
  },
  breakdownItemList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
  },
  breakdownStatus: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    color: vars["--aui-color-text-muted"],
  },
  breakdownNote: {
    color: vars["--aui-color-text-muted"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  compactButton: {
    marginTop: vars["--aui-space-12"],
    width: "100%",
  },
  emptyNote: {
    marginTop: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
});
