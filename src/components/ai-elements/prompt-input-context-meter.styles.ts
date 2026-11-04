import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const contextMeterStyles = stylex.create({
  trigger: {
    height: 32,
    gap: 6,
    paddingInline: vars["--ads-space-8"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  track: {
    height: 6,
    width: 32,
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-track"],
  },
  fill: {
    display: "block",
    height: "100%",
    borderRadius: vars["--ads-radius-full"],
  },
  fillOk: { backgroundColor: vars["--ads-color-success-border"] },
  fillWarn: { backgroundColor: vars["--ads-color-warning"] },
  fillDanger: { backgroundColor: vars["--ads-color-danger"] },
  percent: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  tokens: { display: { default: "inline", "@container composer (max-width: 480px)": "none" } },
  narrowPercent: { display: { default: "none", "@container composer (max-width: 480px)": "inline" } },
  popover: {
    width: "16rem",
    gap: 0,
    padding: vars["--ads-space-12"],
  },
  popoverTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: vars["--ads-font-size-body"],
  },
  titleIcon: { width: "0.875rem", height: "0.875rem" },
  popoverDescription: {
    marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
  },
  metricsList: {
    marginTop: vars["--ads-space-12"],
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
  },
  metricTerm: { color: vars["--ads-color-text-muted"] },
  metricValue: {
    textAlign: "right",
    fontFamily: vars["--ads-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  /*
   * Composition: the same caption size and term/value inks as the totals
   * above it. Every row reserves the chevron column, so a label that expands
   * and one that does not start on one edge.
   */
  breakdown: {
    marginTop: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-12"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
  },
  breakdownHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  breakdownTitle: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  breakdownProvider: {
    color: vars["--ads-color-text-muted"],
    whiteSpace: "nowrap",
  },
  breakdownList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  breakdownExpandable: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  breakdownRow: {
    display: "grid",
    gridTemplateColumns: `${vars["--ads-space-16"]} minmax(0, 1fr) auto`,
    alignItems: "center",
    columnGap: vars["--ads-space-4"],
    minWidth: 0,
    width: "100%",
  },
  breakdownToggle: {
    borderRadius: vars["--ads-radius-control"],
    color: "inherit",
    textAlign: "start",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  breakdownGutter: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars["--ads-color-text-muted"],
  },
  breakdownChevron: {
    width: "0.875rem",
    height: "0.875rem",
  },
  breakdownChevronOpen: { transform: "rotate(90deg)" },
  breakdownLabel: {
    color: vars["--ads-color-text-muted"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  breakdownItemLabel: {
    color: vars["--ads-color-text-subtle"],
    fontFamily: vars["--ads-font-mono"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  breakdownValue: {
    textAlign: "right",
    fontFamily: vars["--ads-font-mono"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  breakdownItems: {
    paddingInlineStart: vars["--ads-space-12"],
  },
  breakdownItemList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
  },
  breakdownStatus: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    color: vars["--ads-color-text-muted"],
  },
  breakdownNote: {
    color: vars["--ads-color-text-muted"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  compactButton: {
    marginTop: vars["--ads-space-12"],
    width: "100%",
  },
  emptyNote: {
    marginTop: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
});
