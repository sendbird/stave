import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { toolbarMarker } from "./composer-control.stylex";

const mq480 = "@media (min-width: 480px)";
const border65 = `color-mix(in oklch, ${vars["--ads-color-border"]} 65%, transparent)`;
const border70 = `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`;
const border60 = `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`;
const overlayHover = vars["--ads-color-overlay-hover"];

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const modelEffortSelectorStyles = stylex.create({
  /* ---- control group + trigger ---- */
  group: {
    display: "inline-flex",
    // Three independent controls, so this box only sets the shared height.
    // In the composer's in-card toolbar the lane is ADS `sm` (32) — the same
    // rung the attach/send buttons beside it use — so match it there instead
    // of standing 4px taller than its own row. Everywhere else (dispatch
    // runtime fields) the default md control height still applies.
    height: {
      default: vars["--ads-control-height"],
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars["--ads-control-height-sm"],
    },
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
    // The ADS control radius, matching every other button in the toolbar row.
    // `radiusMark` (4px) is for inert marks (chips, thumbnails), not controls.
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${overlayHover} 90%, transparent)`,
    },
    paddingBlock: 0,
    paddingInline: "0.625rem",
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  triggerOpen: {
    backgroundColor: `color-mix(in oklch, ${overlayHover} 100%, transparent)`,
  },
  triggerAccentIcon: {
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    color: vars["--ads-color-accent"],
  },
  triggerIcon: { width: "0.875rem", height: "0.875rem" },
  triggerLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerDot: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 35%, transparent)`,
  },
  triggerEffort: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },

  /* ---- capability toggles (Fast, 1M) ---- */
  capabilityToggle: {
    display: "inline-flex",
    height: "100%",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent-soft"]} 55%, transparent)`,
    },
  },
  capabilityToggleMono: {
    fontFamily: vars["--ads-font-mono"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  capabilityToggleIconOnly: {
    gap: 0,
    paddingInline: vars["--ads-space-8"],
  },
  capabilityToggleFastActive: {
    borderColor:
      "color-mix(in oklch, var(--prompt-role-fast) 30%, transparent)",
    backgroundColor:
      "color-mix(in oklch, var(--prompt-role-fast) 10%, transparent)",
    color: "var(--prompt-role-fast)",
  },
  capabilityToggleContextActive: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
    color: vars["--ads-color-accent"],
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
    borderRadius: vars["--ads-radius-frame"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: border70,
    backgroundColor: vars["--ads-color-surface-raised"],
    // Elevation is the ADS popover surface's to state: this selector is
    // anchored to its composer trigger, so it belongs in the popup band the
    // surface already applies. Overriding it to `elevationModal` here promoted
    // a trigger-anchored popup into the band reserved for detached, backdropped
    // surfaces — the widest ambient layer in the system on composer chrome.
    padding: 0,
  },
  // ADS vertical tabs shrink-wrap the rail: `alignItems: start`, an implicit
  // auto row, and `alignContent: start`. This popover has a fixed height, so
  // that row stays as tall as the model list and the rail's canvas stops
  // short when only a few models are showing. One `1fr` row is safe here —
  // the list and the panel are the only two grid children — and `alignItems`
  // has to be passed as `xstyle` so it wins over the root's `start`.
  tabs: {
    minHeight: 0,
    minWidth: 0,
    flex: 1,
    columnGap: 0,
    rowGap: 0,
    alignItems: "stretch",
    gridTemplateRows: "minmax(0, 1fr)",
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
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    padding: vars["--ads-space-8"],
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
    color: vars["--ads-color-text-muted"],
  },
  searchInput: { height: vars["--ads-control-height"], paddingInlineStart: vars["--ads-space-32"] },
  actionButton: {
    height: vars["--ads-control-height"],
    flexShrink: 0,
    gap: "0.375rem",
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  refreshIcon: { width: "0.875rem", height: "0.875rem" },
  refreshIconSpinning: {
    animationName: spin,
    animationDuration: vars["--ads-motion-duration-loop"],
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  refreshLabel: { display: { default: "none", [mq480]: "inline" } },

  hint: {
    flexShrink: 0,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--ads-color-text-muted"],
  },

  /* ---- catalog notices ---- */
  notice: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  noticeAlignStart: { alignItems: "flex-start" },
  noticeIcon: {
    marginBlockStart: "0.125rem",
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    color: vars["--ads-color-danger"],
  },
  noticeBody: { minWidth: 0, flex: 1 },
  noticeError: {
    flexShrink: 0,
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger"],
  },
  retryButton: {
    height: "1.75rem",
    flexShrink: 0,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
  },
  retryIcon: { width: "0.75rem", height: "0.75rem" },

  /* ---- tab content scroller ---- */
  // The panel's only scrollport, in both axes. The effort grid deliberately has
  // no inner horizontal scroller: a nested one would capture its sticky column
  // header and stop it pinning while this box scrolls.
  tabContent: {
    minHeight: 0,
    overflowX: "auto",
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  // The Auto tab owns the whole panel (no search row above it), so its content
  // stretches instead of scrolling: all four profile rows stay in view.
  tabContentAuto: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
  },
  empty: {
    display: "flex",
    minHeight: "7rem",
    alignItems: "center",
    justifyContent: "center",
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },

  /* ---- model-only list ---- */
  modelList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    padding: vars["--ads-space-8"],
  },
  modelRow: {
    display: "flex",
    minHeight: "2.75rem",
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    textAlign: "left",
  },
  modelRowSelected: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-text"],
  },
  modelRowIdle: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 60%, transparent)`,
    },
  },
  modelRowIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  modelRowBody: { minWidth: 0, flex: 1 },
  modelRowTitleLine: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  modelRowTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  modelRowDefaultBadge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  modelRowCapabilities: {
    marginBlockStart: vars["--ads-space-4"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  capabilityChip: {
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: border60,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 35%, transparent)`,
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  modelRowDescription: {
    marginBlockStart: "0.125rem",
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 80%, transparent)`,
  },

  /* ---- show all models footer ---- */
  showAllFooter: {
    flexShrink: 0,
    borderTopWidth: vars["--ads-border-width-hairline"],
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
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: "0.625rem",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 60%, transparent)`,
    },
  },
  showAllCount: {
    fontVariantNumeric: "tabular-nums",
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 75%, transparent)`,
  },
  railIcon: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"] },
  railAutoIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-accent"],
  },
});
