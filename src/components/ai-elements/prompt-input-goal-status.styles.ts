import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const goalStatusStyles = stylex.create({
  strip: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: vars.space12,
    paddingBlock: 10,
  },
  stripCompact: {
    borderRadius: vars.radiusControl,
    paddingInline: 10,
    paddingBlock: vars.space8,
  },
  toneSuccess: {
    borderColor: `color-mix(in oklch, ${vars.colorSuccessBorder} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorSuccessBorder} 8%, transparent)`,
    color: vars.colorSuccessText,
  },
  toneWarning: {
    borderColor: `color-mix(in oklch, ${vars.colorWarningBorder} 40%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorWarning} 12%, transparent)`,
    color: vars.colorWarningText,
  },
  toneDefault: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 20%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 6%, transparent)`,
    color: vars.colorAccent,
  },
  header: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars.space8,
    rowGap: 6,
  },
  badge: {
    height: 20,
    gap: vars.space4,
    paddingInline: 6,
    fontSize: vars.fontSizeMicro,
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeIcon: { width: 12, height: 12 },
  objective: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  meta: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  progressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: vars.radiusFull,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 70%, transparent)`,
  },
  progressFill: {
    height: "100%",
    borderRadius: vars.radiusFull,
    transitionProperty: "width",
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
  },
  progressFillSuccess: { backgroundColor: vars.colorSuccessBorder },
  progressFillWarning: { backgroundColor: vars.colorWarning },
  progressFillDefault: { backgroundColor: vars.colorAccent },
});
