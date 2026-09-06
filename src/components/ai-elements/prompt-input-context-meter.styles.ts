import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const contextMeterStyles = stylex.create({
  trigger: {
    height: 32,
    gap: 6,
    paddingInline: vars.space8,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  track: {
    height: 6,
    width: 32,
    overflow: "hidden",
    borderRadius: vars.radiusFull,
    backgroundColor: `color-mix(in oklch, ${vars.colorTextMuted} 15%, transparent)`,
  },
  fill: {
    display: "block",
    height: "100%",
    borderRadius: vars.radiusFull,
  },
  fillOk: { backgroundColor: vars.colorSuccessBorder },
  fillWarn: { backgroundColor: vars.colorWarning },
  fillDanger: { backgroundColor: vars.colorDanger },
  percent: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
  },
  popover: {
    width: "16rem",
    gap: 0,
    padding: vars.space12,
  },
  popoverTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: vars.fontSizeBody,
  },
  titleIcon: { width: "0.875rem", height: "0.875rem" },
  popoverDescription: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeCaption,
  },
  metricsList: {
    marginTop: vars.space12,
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: vars.space12,
    rowGap: vars.space4,
    fontSize: vars.fontSizeCaption,
  },
  metricTerm: { color: vars.colorTextMuted },
  metricValue: { textAlign: "right", fontFamily: vars.fontMono },
  compactButton: {
    marginTop: vars.space12,
    width: "100%",
  },
  emptyNote: {
    marginTop: vars.space12,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
});
