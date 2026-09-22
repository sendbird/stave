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
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 15%, transparent)`,
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
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
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
