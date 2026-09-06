import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const mq480 = "@media (min-width: 480px)";
const border65 = `color-mix(in oklch, ${vars.colorBorder} 65%, transparent)`;
const border70 = `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`;
const border60 = `color-mix(in oklch, ${vars.colorBorder} 60%, transparent)`;
const overlayHover = vars.colorOverlayHover;

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const modelEffortSelectorStyles = stylex.create({
  /* ---- control group + trigger ---- */
  group: {
    display: "inline-flex",
    height: vars.controlHeight,
    maxWidth: "100%",
    alignItems: "center",
    gap: "0.375rem",
  },
  trigger: {
    display: "inline-flex",
    height: "100%",
    minWidth: 0,
    maxWidth: 320,
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${overlayHover} 90%, transparent)`,
    },
    paddingBlock: 0,
    paddingInline: "0.625rem",
    fontSize: vars.fontSizeBody,
    color: vars.colorText,
  },
  triggerOpen: {
    backgroundColor: `color-mix(in oklch, ${overlayHover} 100%, transparent)`,
  },
  triggerAccentIcon: {
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    color: vars.colorAccent,
  },
  triggerIcon: { width: "0.875rem", height: "0.875rem" },
  triggerLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerDot: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 35%, transparent)`,
  },
  triggerEffort: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted,
  },

  /* ---- capability toggles (Fast, 1M) ---- */
  capabilityToggle: {
    display: "inline-flex",
    height: "100%",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space4,
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: "transparent",
    paddingBlock: 0,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    backgroundColor: {
      default: null,
      ":hover": `color-mix(in oklch, ${vars.colorAccentSoft} 55%, transparent)`,
    },
  },
  capabilityToggleSemibold: { fontWeight: vars.fontWeightSemibold },
  capabilityToggleFastActive: {
    borderColor:
      "color-mix(in oklch, var(--prompt-role-fast) 30%, transparent)",
    backgroundColor:
      "color-mix(in oklch, var(--prompt-role-fast) 10%, transparent)",
    color: "var(--prompt-role-fast)",
  },
  capabilityToggleContextActive: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 10%, transparent)`,
    color: vars.colorAccent,
  },
  toggleIcon: { width: "0.875rem", height: "0.875rem" },
  toggleIconFilled: { fill: "currentColor" },

  /* ---- popover ---- */
  popover: {
    display: "flex",
    height: "min(25rem, calc(100dvh - 1rem))",
    width: "min(40rem, calc(100vw - 1rem))",
    minWidth: 0,
    maxWidth: "100%",
    flexDirection: "column",
    gap: 0,
    overflow: "hidden",
    borderRadius: vars.radiusFrame,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: border70,
    backgroundColor: vars.colorSurfaceRaised,
    // Bespoke floating-selector elevation: a wider, softer ambient layer than the
    // generic anchored-popover shadow, so this large surface reads as detached
    // rather than a card sitting on the composer. Contact + ambient pair.
    boxShadow:
      "0 4px 12px -6px oklch(0.1375 0.007 89 / 0.4), 0 18px 48px -12px oklch(0.1375 0.007 89 / 0.36)",
    padding: 0,
  },
  // ADS vertical Tabs.Root shrink-wraps the rail to its own tab content
  // (`alignItems: start`). This selector's provider rail must instead span the
  // full popover height, matching the original flex layout, so stretch it.
  tabs: {
    minHeight: 0,
    minWidth: 0,
    flex: 1,
    columnGap: 0,
    rowGap: 0,
    alignItems: "stretch",
  },
  panel: {
    display: "flex",
    minHeight: 0,
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
  },

  /* ---- search row ---- */
  searchBar: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space8,
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    padding: vars.space8,
  },
  searchField: { position: "relative", minWidth: 0, flex: 1 },
  searchIcon: {
    pointerEvents: "none",
    position: "absolute",
    insetBlockStart: "50%",
    insetInlineStart: "0.625rem",
    width: "0.875rem",
    height: "0.875rem",
    transform: "translateY(-50%)",
    color: vars.colorTextMuted,
  },
  searchInput: { height: vars.controlHeight, paddingInlineStart: vars.space32 },
  actionButton: {
    height: vars.controlHeight,
    flexShrink: 0,
    gap: "0.375rem",
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  actionButtonAuto: {
    height: vars.controlHeight,
    flexShrink: 0,
    gap: "0.375rem",
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  actionButtonAutoActive: {
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 10%, transparent)`,
    color: vars.colorAccent,
  },
  refreshIcon: { width: "0.875rem", height: "0.875rem" },
  refreshIconSpinning: {
    animationName: spin,
    animationDuration: vars.motionDurationLoop,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  refreshLabel: { display: { default: "none", [mq480]: "inline" } },
  autoIcon: { width: "0.875rem", height: "0.875rem" },

  hint: {
    flexShrink: 0,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1rem",
    color: vars.colorTextMuted,
  },

  /* ---- catalog notices ---- */
  notice: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space8,
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  noticeAlignStart: { alignItems: "flex-start" },
  noticeIcon: {
    marginBlockStart: "0.125rem",
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    color: vars.colorDanger,
  },
  noticeBody: { minWidth: 0, flex: 1 },
  noticeError: {
    flexShrink: 0,
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorDanger,
  },
  retryButton: {
    height: "1.75rem",
    flexShrink: 0,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
  },
  retryIcon: { width: "0.75rem", height: "0.75rem" },

  /* ---- tab content scroller ---- */
  tabContent: {
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  empty: {
    display: "flex",
    minHeight: "7rem",
    alignItems: "center",
    justifyContent: "center",
    paddingInline: vars.space16,
    textAlign: "center",
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },

  /* ---- model-only list ---- */
  modelList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    padding: vars.space8,
  },
  modelRow: {
    display: "flex",
    minHeight: "2.75rem",
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    gap: vars.space12,
    borderRadius: vars.radiusControl,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    textAlign: "left",
  },
  modelRowSelected: {
    backgroundColor: vars.colorSelectionFill,
    color: vars.colorText,
  },
  modelRowIdle: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    backgroundColor: {
      default: null,
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 60%, transparent)`,
    },
  },
  modelRowIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  modelRowBody: { minWidth: 0, flex: 1 },
  modelRowTitleLine: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars.space8,
  },
  modelRowTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  modelRowDefaultBadge: {
    flexShrink: 0,
    borderRadius: vars.radiusFull,
    backgroundColor: vars.colorCanvasSubtle,
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  modelRowCapabilities: {
    marginBlockStart: vars.space4,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space4,
  },
  capabilityChip: {
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: border60,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 35%, transparent)`,
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted,
  },
  modelRowDescription: {
    marginBlockStart: "0.125rem",
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeCaption,
    color: `color-mix(in oklch, ${vars.colorTextMuted} 80%, transparent)`,
  },

  /* ---- show all models footer ---- */
  showAllFooter: {
    flexShrink: 0,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: border65,
    padding: "0.375rem",
  },
  showAllButton: {
    display: "flex",
    minHeight: "2.75rem",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: vars.radiusMark,
    paddingInline: "0.625rem",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    backgroundColor: {
      default: null,
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 60%, transparent)`,
    },
  },
  showAllCount: {
    fontVariantNumeric: "tabular-nums",
    color: `color-mix(in oklch, ${vars.colorTextMuted} 75%, transparent)`,
  },
  railIcon: { width: vars.controlIconSizeSm, height: vars.controlIconSizeSm },
});
