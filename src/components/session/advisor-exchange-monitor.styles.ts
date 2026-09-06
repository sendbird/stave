import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

const enter = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-8px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

export const advisorExchangeMonitorStyles = stylex.create({
  // Floating wrapper. Composes the shared floater wrapper class at the call
  // site; this owns only the position offsets and width.
  wrapper: {
    right: 64,
    top: vars.space12,
    width: "min(23rem, calc(100% - 6rem))",
  },

  // Card shell (composed with UI_ELEVATION_CLASS.floating at the call site).
  card: {
    animationName: {
      default: enter,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: vars.motionDurationNormal,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars.motionEaseStandard,
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "auto",
  },

  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  headerLoader: {
    flexShrink: 0,
  },
  headerIcon: {
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  headerTitle: {
    flex: 1,
    fontSize: "0.8125rem",
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerWarn: {
    color: vars.colorDangerText,
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  outcomeBadge: {
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.025em",
    lineHeight: "1rem",
    paddingInline: vars.space4,
  },

  participantRow: {
    alignItems: "flex-end",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    paddingInline: vars.space12,
    paddingTop: "0.625rem",
  },
  chip: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars.space2,
    minWidth: 0,
  },
  chipRole: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  chipName: {
    fontSize: "0.8125rem",
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipNameMuted: {
    color: vars.colorTextMuted,
  },
  chipNameActive: {
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: vars.motionDurationLoop,
    animationIterationCount: "infinite",
    animationTimingFunction: vars.motionEaseInOut,
  },

  batonTrack: {
    height: 12,
    marginBottom: vars.space4,
    position: "relative",
    width: 48,
    flexShrink: 0,
  },
  batonRail: {
    backgroundColor: vars.colorBorder,
    height: 1,
    insetInline: 0,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  baton: {
    borderRadius: vars.radiusFull,
    height: 6,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    transitionDuration: {
      default: "700ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "left",
    transitionTimingFunction: vars.motionEaseStandard,
    width: 6,
  },

  laneTrack: {
    backgroundColor: vars.colorBorder,
    display: "flex",
    flexShrink: 0,
    height: 4,
    marginTop: "0.625rem",
    overflow: "hidden",
    width: "100%",
  },
  lane: {
    height: "100%",
    transitionDuration: {
      default: vars.motionDurationFast,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  laneBlocked: {
    backgroundColor: vars.colorTextMuted,
    height: "100%",
    transitionDuration: {
      default: vars.motionDurationFast,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width",
    transitionTimingFunction: vars.motionEaseStandard,
  },

  statusRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  statusText: {
    color: vars.colorTextMuted,
    flex: 1,
    fontSize: "0.75rem",
    lineHeight: 1.5,
    minWidth: 0,
  },
  statusElapsed: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
  },

  skipRow: {
    alignItems: "center",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    paddingBlock: "0.375rem",
    paddingInline: vars.space12,
  },
  skipText: {
    color: vars.colorTextMuted,
    flex: 1,
    fontSize: "0.75rem",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  skipButton: {
    flexShrink: 0,
    gap: vars.space4,
  },

  expanded: {
    backgroundColor: vars.colorCanvasSubtle,
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    maxHeight: "min(24rem, 45vh)",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: "0.625rem",
    paddingInline: vars.space12,
  },
  sectionLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  sectionLabelSpaced: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    marginTop: vars.space12,
    textTransform: "uppercase",
  },
  checkList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 6,
  },
  checkItem: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space8,
  },
  checkBody: {
    flex: 1,
    minWidth: 0,
  },
  checkLabel: {
    color: vars.colorText,
    fontSize: "0.75rem",
    lineHeight: 1.45,
  },
  checkLabelFail: {
    color: vars.colorDangerText,
    fontWeight: vars.fontWeightMedium,
  },
  checkDetail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: 1.45,
    overflowWrap: "break-word",
  },
  prose: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    fontSize: "0.75rem",
    lineHeight: 1.5,
    marginTop: vars.space4,
    overflowWrap: "break-word",
    paddingBlock: 6,
    paddingInline: vars.space8,
    whiteSpace: "pre-wrap",
  },
  lifecycleList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    marginTop: vars.space4,
  },
  lifecycleItem: {
    alignItems: "baseline",
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space8,
    lineHeight: 1.5,
  },
  lifecycleAt: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  lifecycleLabel: {
    color: vars.colorTextMuted,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaGrid: {
    columnGap: vars.space12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    marginTop: vars.space12,
    rowGap: 6,
  },
  metaCell: {
    minWidth: 0,
  },
  metaTerm: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  metaValue: {
    color: vars.colorText,
    fontSize: vars.fontSizeMicro,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footerRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
    justifyContent: "flex-end",
    marginTop: vars.space12,
  },
  logButton: {
    gap: vars.space4,
    marginRight: "auto",
  },
});

// Accent ink for the tone-tinted header glyph/loader.
export const advisorExchangeTone = stylex.create({
  neutral: { color: vars.colorTextMuted },
  active: { color: vars.colorInfoText },
  positive: { color: vars.colorSuccessText },
  caution: { color: vars.colorWarningText },
  danger: { color: vars.colorDangerText },
});

// Tone chip: soft fill + matching border + text ink.
export const advisorExchangeToneBadge = stylex.create({
  neutral: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
  },
  active: {
    backgroundColor: vars.colorInfoSoft,
    borderColor: vars.colorInfoBorder,
    color: vars.colorInfoText,
  },
  positive: {
    backgroundColor: vars.colorSuccessSoft,
    borderColor: vars.colorSuccessBorder,
    color: vars.colorSuccessText,
  },
  caution: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    color: vars.colorWarningText,
  },
  danger: {
    backgroundColor: vars.colorDangerSoft,
    borderColor: vars.colorDangerBorder,
    color: vars.colorDangerText,
  },
});

// Provider bar fills read the themed provider tone variables (same values the
// sidebar tone styles use); the fallback is the muted text ink.
export const advisorExchangeProviderBar = stylex.create({
  claude: { backgroundColor: "var(--provider-claude)" },
  codex: { backgroundColor: "var(--provider-codex)" },
  fallback: { backgroundColor: vars.colorTextMuted },
});

// Participant name ink by provider wave tone. `getProviderWaveTone` returns
// one of these keys; themed provider CSS variables and the ADS accent token
// carry the color.
export const advisorExchangeWaveTone = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  accent: { color: vars.colorAccent },
});
