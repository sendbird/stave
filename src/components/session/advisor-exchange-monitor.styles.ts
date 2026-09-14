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
    top: vars["--ads-space-12"],
    width: "min(23rem, calc(100% - 6rem))",
  },

  // Card shell (composed with UI_ELEVATION_CLASS.floating at the call site).
  card: {
    animationName: {
      default: enter,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: vars["--ads-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars["--ads-motion-ease-standard"],
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "auto",
  },

  header: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
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
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerWarn: {
    color: vars["--ads-color-danger-text"],
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  outcomeBadge: {
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.025em",
    lineHeight: "1rem",
    paddingInline: vars["--ads-space-4"],
  },

  participantRow: {
    alignItems: "flex-end",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    paddingTop: "0.625rem",
  },
  chip: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  chipRole: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  chipName: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipNameMuted: {
    color: vars["--ads-color-text-muted"],
  },
  chipNameActive: {
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationTimingFunction: vars["--ads-motion-ease-in-out"],
  },

  batonTrack: {
    height: 12,
    marginBottom: vars["--ads-space-4"],
    position: "relative",
    width: 48,
    flexShrink: 0,
  },
  batonRail: {
    backgroundColor: vars["--ads-color-border"],
    height: 1,
    insetInline: 0,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  baton: {
    borderRadius: vars["--ads-radius-full"],
    height: 6,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    transitionDuration: {
      default: "700ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "left",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    width: 6,
  },

  laneTrack: {
    backgroundColor: vars["--ads-color-border"],
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
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  laneBlocked: {
    backgroundColor: vars["--ads-color-text-muted"],
    height: "100%",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },

  statusRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  statusText: {
    color: vars["--ads-color-text-muted"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.5,
    minWidth: 0,
  },
  statusElapsed: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },

  skipRow: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingBlock: "0.375rem",
    paddingInline: vars["--ads-space-12"],
  },
  skipText: {
    color: vars["--ads-color-text-muted"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  skipButton: {
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },

  expanded: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    maxHeight: "min(24rem, 45vh)",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: "0.625rem",
    paddingInline: vars["--ads-space-12"],
  },
  sectionLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  sectionLabelSpaced: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    marginTop: vars["--ads-space-12"],
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
    gap: vars["--ads-space-8"],
  },
  checkBody: {
    flex: 1,
    minWidth: 0,
  },
  checkLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.45,
  },
  checkLabelFail: {
    color: vars["--ads-color-danger-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  checkDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: 1.45,
    overflowWrap: "break-word",
  },
  prose: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.5,
    marginTop: vars["--ads-space-4"],
    overflowWrap: "break-word",
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
    whiteSpace: "pre-wrap",
  },
  lifecycleList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    marginTop: vars["--ads-space-4"],
  },
  lifecycleItem: {
    alignItems: "baseline",
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-8"],
    lineHeight: 1.5,
  },
  lifecycleAt: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  lifecycleLabel: {
    color: vars["--ads-color-text-muted"],
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaGrid: {
    columnGap: vars["--ads-space-12"],
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    marginTop: vars["--ads-space-12"],
    rowGap: 6,
  },
  metaCell: {
    minWidth: 0,
  },
  metaTerm: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  metaValue: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-micro"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footerRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    justifyContent: "flex-end",
    marginTop: vars["--ads-space-12"],
  },
  logButton: {
    gap: vars["--ads-space-4"],
    marginRight: "auto",
  },
});

// Accent ink for the tone-tinted header glyph/loader.
export const advisorExchangeTone = stylex.create({
  neutral: { color: vars["--ads-color-text-muted"] },
  active: { color: vars["--ads-color-info-text"] },
  positive: { color: vars["--ads-color-success-text"] },
  caution: { color: vars["--ads-color-warning-text"] },
  danger: { color: vars["--ads-color-danger-text"] },
});

// Tone chip: soft fill + matching border + text ink.
export const advisorExchangeToneBadge = stylex.create({
  neutral: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    color: vars["--ads-color-text-muted"],
  },
  active: {
    backgroundColor: vars["--ads-color-info-soft"],
    borderColor: vars["--ads-color-info-border"],
    color: vars["--ads-color-info-text"],
  },
  positive: {
    backgroundColor: vars["--ads-color-success-soft"],
    borderColor: vars["--ads-color-success-border"],
    color: vars["--ads-color-success-text"],
  },
  caution: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    color: vars["--ads-color-warning-text"],
  },
  danger: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    color: vars["--ads-color-danger-text"],
  },
});

// Provider bar fills read the themed provider tone variables (same values the
// sidebar tone styles use); the fallback is the muted text ink.
export const advisorExchangeProviderBar = stylex.create({
  claude: { backgroundColor: "var(--provider-claude)" },
  codex: { backgroundColor: "var(--provider-codex)" },
  fallback: { backgroundColor: vars["--ads-color-text-muted"] },
});

// Participant name ink by provider wave tone. `getProviderWaveTone` returns
// one of these keys; themed provider CSS variables and the ADS accent token
// carry the color.
export const advisorExchangeWaveTone = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  accent: { color: vars["--ads-color-accent"] },
});
