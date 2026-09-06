import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const LG = "@media (min-width: 64rem)";

export const rightRailStyles = stylex.create({
  rail: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    height: "100%",
    paddingBlock: { default: vars.space8, [LG]: vars.space12 },
    width: { default: 48, [LG]: 56 },
  },
  stack: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    width: "100%",
  },
  triggerHost: { display: "inline-flex" },
  railButton: {
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: { default: 36, [LG]: 40 },
    padding: 0,
    width: { default: 36, [LG]: 40 },
  },
  railButtonRelative: { position: "relative" },
  railButtonInactive: {
    backgroundColor: { default: null, ":hover": vars.colorOverlayHover },
    borderColor: { default: "transparent", ":hover": vars.colorBorder },
  },
  railIcon: {
    height: { default: vars.controlIconSizeSm, [LG]: vars.controlIconSizeMd },
    width: { default: vars.controlIconSizeSm, [LG]: vars.controlIconSizeMd },
  },
  runningBadge: {
    alignItems: "center",
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    color: vars.colorAccentText,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    height: 14,
    insetBlockStart: -2,
    insetInlineEnd: -2,
    justifyContent: "center",
    lineHeight: 1,
    minWidth: 14,
    paddingInline: 2,
    position: "absolute",
  },
});
