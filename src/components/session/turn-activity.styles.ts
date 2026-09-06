import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

// Enter/exit for the whole shelf: a short fade paired with a 8px vertical
// slide, so the shelf grows in and collapses away instead of popping.
const enter = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(8px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const exit = stylex.keyframes({
  from: { opacity: 1, transform: "translateY(0)" },
  to: { opacity: 0, transform: "translateY(8px)" },
});

// A row appears once when its activity lands; it does not replay on updates.
const rowIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const SHELF_MOTION_DURATION = "200ms";

export const turnActivityStyles = stylex.create({
  panelIdle: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeBody,
    height: "100%",
    justifyContent: "center",
    paddingInline: vars.space24,
    textAlign: "center",
  },
  // Floating shell inner pointer target.
  floatInner: {
    pointerEvents: "auto",
    width: "min(26rem, 80vw)",
  },

  // ── Outer stack, per variant ────────────────────────────────────────
  stackDocked: {
    position: "relative",
    zIndex: 0,
  },
  // Standalone docked pulls the composer up over its extra bottom padding.
  stackDockedStandalone: {
    marginBottom: "-0.75rem",
    marginInline: vars.space12,
    position: "relative",
    zIndex: 0,
  },
  stackFloating: {
    position: "relative",
  },
  stackPanel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  stackEnter: {
    animationName: {
      default: enter,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: SHELF_MOTION_DURATION,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars.motionEaseStandard,
  },
  stackLeaving: {
    animationName: {
      default: exit,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: SHELF_MOTION_DURATION,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationFillMode: "forwards",
    animationTimingFunction: vars.motionEaseStandard,
    pointerEvents: "none",
  },

  // ── Surface section ─────────────────────────────────────────────────
  surface: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
    transitionDuration: {
      default: "200ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "box-shadow, border-color",
    transitionTimingFunction: "ease-out",
  },
  // A floating or panelled surface is a card in its own right; the docked one
  // takes its surface from the global `.turn-activity-surface` class.
  surfaceCard: {
    backgroundColor: vars.colorSurface,
  },
  surfaceDocked: {
    borderStartStartRadius: vars.radiusFrame,
    borderStartEndRadius: vars.radiusFrame,
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
    paddingBottom: "0.75rem",
  },
  surfaceFloating: {
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationOverlay,
    paddingBottom: vars.space8,
  },
  surfacePanel: {
    flex: 1,
    paddingBottom: vars.space8,
  },

  // ── Header row ──────────────────────────────────────────────────────
  header: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.625rem",
    minHeight: "2.75rem",
    paddingInline: vars.space12,
  },
  headerInset: {
    paddingBlock: vars.space12,
  },
  headerStandard: {
    paddingBlock: vars.space8,
  },
  headerExpanded: {
    backgroundColor: `color-mix(in oklch, ${vars.colorSurfaceTint} 10%, transparent)`,
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 50%, transparent)`,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
  },
  headerGrab: {
    cursor: "grab",
    touchAction: "none",
    userSelect: "none",
  },
  loaderSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  loaderInk: {
    color: vars.colorText,
  },
  // Visually hidden but present for AT — used where the element's tag matters
  // (the `<h2>` heading) so the ADS VisuallyHidden span cannot substitute.
  srOnly: {
    blockSize: 1,
    borderWidth: 0,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    insetBlockStart: 0,
    insetInlineStart: 0,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  replayBadge: {
    backgroundColor: vars.colorSurfaceTint,
    borderRadius: vars.radiusFull,
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.025em",
    paddingBlock: "0.125rem",
    paddingInline: vars.space8,
    textTransform: "uppercase",
  },
  headline: {
    flex: 1,
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    fontSize: "0.8125rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headlineTitle: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  headlineDetail: {
    color: vars.colorTextMuted,
  },
  progress: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: "0.6875rem",
    fontVariantNumeric: "tabular-nums",
  },
  overflowCount: {
    flexShrink: 0,
    fontSize: "0.6875rem",
    fontWeight: vars.fontWeightMedium,
    fontVariantNumeric: "tabular-nums",
  },
  overflowFailed: {
    color: vars.colorDanger,
  },
  overflowWaiting: {
    color: vars.colorWarning,
  },
  overflowDefault: {
    color: vars.colorTextMuted,
  },
  elapsed: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: "0.6875rem",
    fontVariantNumeric: "tabular-nums",
  },

  // ── Placement controls ──────────────────────────────────────────────
  placementGroup: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.125rem",
  },
  placementButton: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
  },
  chevron: {
    height: 14,
    width: 14,
  },

  // ── List ────────────────────────────────────────────────────────────
  list: {
    backgroundColor: `color-mix(in oklch, ${vars.colorSurfaceTint} 10%, transparent)`,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  listDocked: {
    maxHeight: "min(12rem, 28vh)",
  },
  listFloating: {
    maxHeight: "min(24rem, 55vh)",
  },
  listPanel: {
    flex: 1,
  },
  listInner: {
    paddingBlock: 6,
    paddingInline: 6,
  },
  childBlock: {
    paddingInline: 6,
    paddingTop: vars.space8,
  },
  childBlockPadded: {
    paddingBottom: vars.space4,
    paddingInline: 6,
    paddingTop: vars.space8,
  },

  // ── Row ─────────────────────────────────────────────────────────────
  rowStatusSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 20,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    fontSize: "0.8125rem",
  },
  rowTitleLineDone: {
    color: vars.colorTextMuted,
  },
  rowTitle: {
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowBadge: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    paddingInline: vars.space4,
  },
  rowDetailLine: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    gap: 6,
    lineHeight: "1rem",
    margin: 0,
    minWidth: 0,
    fontSize: "0.6875rem",
  },
  rowDetail: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDetailRule: {
    backgroundColor: vars.colorBorder,
    flexShrink: 0,
    height: "0.625rem",
    width: 1,
  },
  rowProviderDetail: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowStartOffset: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    flexShrink: 0,
    fontSize: "0.6875rem",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
    paddingTop: "0.125rem",
  },
  rowElapsed: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: "0.6875rem",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
    paddingTop: "0.125rem",
  },
  // Row shell — plain or interactive; the interactive one composes the ADS
  // quiet-button chrome / focus ring at the call site.
  row: {
    alignItems: "flex-start",
    borderRadius: vars.radiusPanel,
    display: "flex",
    gap: "0.625rem",
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars.space8,
    textAlign: "left",
    width: "100%",
  },
  rowMotion: {
    animationName: {
      default: rowIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: SHELF_MOTION_DURATION,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars.motionEaseStandard,
  },
});
