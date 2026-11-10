import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { toolbarMarker } from "./composer-control.stylex";

const mq480 = "@media (min-width: 480px)";
const border65 = `color-mix(in oklch, ${vars["--aui-color-border"]} 65%, transparent)`;
const border70 = `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`;
const border60 = `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`;
const overlayHover = vars["--aui-color-overlay-hover"];

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const modelEffortSelectorStyles = stylex.create({
  /* ---- control group + trigger ---- */
  group: {
    display: "inline-flex",
    // Three independent controls, so this box only sets the shared height.
    // In the composer's in-card toolbar the lane is AUI `sm` (32) — the same
    // rung the attach/send buttons beside it use — so match it there instead
    // of standing 4px taller than its own row. Everywhere else (dispatch
    // runtime fields) the default md control height still applies.
    height: {
      default: vars["--aui-control-height"],
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars["--aui-control-height-sm"],
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
    // The AUI control radius, matching every other button in the toolbar row.
    // `radiusMark` (4px) is for inert marks (chips, thumbnails), not controls.
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${overlayHover} 90%, transparent)`,
    },
    paddingBlock: 0,
    paddingInline: "0.625rem",
    fontSize: vars["--aui-font-size-body"],
    // In the composer lane the trigger rests muted like the controls beside
    // it and takes full text on hover, focus and while open, so the prompt
    // reads first. Elsewhere (dispatch runtime fields) it shows its value in
    // full text, as a field does.
    color: {
      default: vars["--aui-color-text"],
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
      ":focus-visible": vars["--aui-color-text"],
    },
  },
  triggerOpen: {
    backgroundColor: `color-mix(in oklch, ${overlayHover} 100%, transparent)`,
    color: vars["--aui-color-text"],
  },
  triggerAccentIcon: {
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    color: vars["--aui-color-accent"],
  },
  triggerIcon: { width: "0.875rem", height: "0.875rem" },
  triggerLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerAgent: {
    maxWidth: "9rem",
    flexShrink: 1,
  },

  /* ---- agent mode: the trigger splits into agent | model ---- */
  // One bordered control with two hit areas. The border and the corners belong
  // to the pair; each segment only rounds its outer corners so its hover fill
  // meets the border.
  segments: {
    display: "inline-flex",
    height: "100%",
    minWidth: 0,
    maxWidth: "100%",
    alignItems: "stretch",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: border65,
  },
  segment: {
    borderWidth: 0,
    borderRadius: 0,
    paddingInline: "0.5rem",
  },
  segmentStart: {
    borderStartStartRadius: vars["--aui-radius-control"],
    borderEndStartRadius: vars["--aui-radius-control"],
  },
  segmentEnd: {
    borderStartEndRadius: vars["--aui-radius-control"],
    borderEndEndRadius: vars["--aui-radius-control"],
    // The model segment gives way first when the composer is narrow.
    flexShrink: 1,
  },
  segmentDivider: {
    width: vars["--aui-border-width-hairline"],
    alignSelf: "stretch",
    flexShrink: 0,
    backgroundColor: border65,
  },
  segmentChevron: {
    width: "0.75rem",
    height: "0.75rem",
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  // "Pinned" is a state word, not part of the model's name.
  segmentPinned: {
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  // The pin picker's first row sits above the search, apart from the model list.
  routeRow: {
    flexShrink: 0,
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    padding: vars["--aui-space-8"],
  },
  triggerDot: {
    color: vars["--aui-color-text-muted"],
  },
  triggerEffort: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },

  /* ---- capability toggles (Fast, 1M) ---- */
  capabilityToggle: {
    display: "inline-flex",
    height: "100%",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    paddingBlock: 0,
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-accent-soft"]} 55%, transparent)`,
    },
  },
  capabilityToggleMono: {
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  capabilityToggleIconOnly: {
    gap: 0,
    paddingInline: vars["--aui-space-8"],
  },
  capabilityToggleFastActive: {
    borderColor:
      "color-mix(in oklch, var(--prompt-role-fast) 30%, transparent)",
    backgroundColor:
      "color-mix(in oklch, var(--prompt-role-fast) 10%, transparent)",
    color: "var(--prompt-role-fast)",
  },
  capabilityToggleContextActive: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 10%, transparent)`,
    color: vars["--aui-color-accent"],
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
    borderRadius: vars["--aui-radius-frame"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: border70,
    backgroundColor: vars["--aui-color-surface-raised"],
    // Elevation is the AUI popover surface's to state: this selector is
    // anchored to its composer trigger, so it belongs in the popup band the
    // surface already applies. Overriding it to `elevationModal` here promoted
    // a trigger-anchored popup into the band reserved for detached, backdropped
    // surfaces — the widest ambient layer in the system on composer chrome.
    padding: 0,
  },
  // AUI vertical tabs shrink-wrap the rail: `alignItems: start`, an implicit
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
    gap: vars["--aui-space-8"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    padding: vars["--aui-space-8"],
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
    color: vars["--aui-color-text-muted"],
  },
  searchInput: { height: vars["--aui-control-height"], paddingInlineStart: vars["--aui-space-32"] },
  actionButton: {
    height: vars["--aui-control-height"],
    flexShrink: 0,
    gap: "0.375rem",
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  refreshIcon: { width: "0.875rem", height: "0.875rem" },
  refreshIconSpinning: {
    animationName: spin,
    animationDuration: vars["--aui-motion-duration-loop"],
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  refreshLabel: { display: { default: "none", [mq480]: "inline" } },

  hint: {
    flexShrink: 0,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    color: vars["--aui-color-text-muted"],
  },

  /* ---- catalog notices ---- */
  notice: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--aui-space-8"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  noticeAlignStart: { alignItems: "flex-start" },
  noticeIcon: {
    marginBlockStart: "0.125rem",
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    color: vars["--aui-color-danger"],
  },
  noticeBody: { minWidth: 0, flex: 1 },
  noticeError: {
    flexShrink: 0,
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-danger"],
  },
  retryButton: {
    height: "1.75rem",
    flexShrink: 0,
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
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
    paddingInline: vars["--aui-space-16"],
    textAlign: "center",
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },

  /* ---- model-only list ---- */
  modelList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    padding: vars["--aui-space-8"],
  },
  modelRow: {
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    minHeight: "2.75rem",
    width: "100%",
    minWidth: 0,
    alignItems: "flex-start",
    gap: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    textAlign: "left",
  },
  modelRowSelected: {
    backgroundColor: vars["--aui-color-selection-fill"],
    color: vars["--aui-color-text"],
  },
  modelRowIdle: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 60%, transparent)`,
    },
  },
  modelRowMark: { display: "flex", alignItems: "center", blockSize: "1lh", flexShrink: 0 },
  modelRowIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
  },
  modelRowBody: { minWidth: 0, flex: 1 },
  // Details wrap beside the published price; unpriced models leave no price.
  modelRowPrice: { justifySelf: "end" },
  modelRowDescriptionLine: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    marginBlockStart: vars["--aui-space-4"],
    alignItems: "baseline",
    columnGap: vars["--aui-space-8"],
    minWidth: 0,
  },
  modelRowTitleLine: {
    display: "flex",
    flexWrap: "wrap",
    minWidth: 0,
    alignItems: "baseline",
    gap: vars["--aui-space-8"],
  },
  modelRowTitle: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  modelRowDefaultBadge: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--aui-font-size-micro"],
    color: vars["--aui-color-text-muted"],
  },
  /** A caution beside the name, such as a model experimental on this runtime. */
  modelRowNoticeBadge: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-warning-soft"],
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--aui-font-size-micro"],
    color: vars["--aui-color-warning-text"],
  },
  /** Names the source of a provider's list, such as "Company gateway · API billing". */
  modelGroupHeading: {
    paddingInline: vars["--aui-space-12"],
    paddingBlockStart: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  /** Inside the effort grid, whose cells already sit inside the grid's padding. */
  modelGroupHeadingInGrid: {
    paddingInline: vars["--aui-space-8"],
  },
  /** An API connection's heading with its "Edit models" action at the end. */
  modelGroupHeadingRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
  },
  modelRowCapabilities: {
    marginBlockStart: vars["--aui-space-4"],
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "baseline",
    columnGap: vars["--aui-space-8"],
  },
  modelRowCapabilityList: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], minWidth: 0 },
  capabilityChip: {
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: border60,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 35%, transparent)`,
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: "1rem",
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  modelRowDescription: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },

  /* ---- show all models footer ---- */
  showAllFooter: {
    flexShrink: 0,
    borderTopWidth: vars["--aui-border-width-hairline"],
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
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: "0.625rem",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 60%, transparent)`,
    },
  },
  showAllCount: {
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  railIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  railAutoIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-accent"],
  },
});
