import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Chrome for the status-bar usage segment and its detail popover. */
export const statusBarUsageStyles = stylex.create({
  /** Vertical rhythm groups; replaces the former `space-y-*` stacks. */
  stackTight: { display: "flex", flexDirection: "column", gap: 6 },
  stackSnug: { display: "flex", flexDirection: "column", gap: vars.space8 },
  stack: { display: "flex", flexDirection: "column", gap: vars.space12 },

  windowHead: {
    alignItems: "center",
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space12,
    justifyContent: "space-between",
    minWidth: 0,
  },
  windowLabel: {
    color: vars.colorTextMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  windowValue: {
    color: vars.colorTextSubtle,
    flexShrink: 0,
    fontFamily: vars.fontMono,
  },
  meterTrack: {
    backgroundColor: vars.colorOverlayPressed,
    borderRadius: vars.radiusFull,
    height: 6,
    overflow: "hidden",
  },
  meterFill: { borderRadius: vars.radiusFull, height: "100%" },

  toneOk: { backgroundColor: vars.colorSuccess },
  toneWarn: { backgroundColor: vars.colorWarning },
  toneDanger: { backgroundColor: vars.colorDanger },
  toneUnknown: { backgroundColor: vars.colorTextSubtle },

  note: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  noteFaint: { color: vars.colorTextSubtle, fontSize: vars.fontSizeMicro },
  bucketTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  bucketPlan: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightRegular,
    marginInlineStart: vars.space4,
  },
  amountRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars.fontSizeCaption,
    justifyContent: "space-between",
  },
  amountLabel: { color: vars.colorTextMuted },
  amountValue: { color: vars.colorTextSubtle, fontFamily: vars.fontMono },

  trigger: {
    borderRadius: 0,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    backgroundColor: { default: null, ":hover": vars.colorOverlayHover },
    fontSize: vars.fontSizeCaption,
    gap: 6,
    height: 24,
    paddingInline: vars.space8,
  },
  triggerDot: {
    borderRadius: vars.radiusFull,
    display: "inline-block",
    height: 6,
    width: 6,
  },
  triggerMono: { fontFamily: vars.fontMono },

  popover: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    gap: 0,
    overflow: "hidden",
    padding: 0,
    width: 288,
  },
  popoverHeader: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: vars.space12,
  },
  popoverTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  refreshButton: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    height: 28,
    padding: 0,
    width: 28,
  },
  refreshIcon: { height: vars.controlIconSizeSm, width: vars.controlIconSizeSm },
  refreshIconSpinning: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "linear",
  },
  popoverBody: { padding: vars.space12 },
});
