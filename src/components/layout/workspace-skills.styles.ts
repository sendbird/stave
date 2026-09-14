import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/**
 * A row reveals its actions on hover/focus, but the trigger is the ROW and the
 * target is a descendant — which StyleX has no selector for. The row publishes
 * its state as custom properties and the children read them, the same
 * parent-publishes/child-reads shape the markdown preview uses for paragraph
 * margins.
 */
const ROW_ACTION_OPACITY = "--stave-skill-row-actions";
const ROW_CHEVRON_NUDGE = "--stave-skill-row-nudge";

const hairlineRing = `0 0 0 1px ${vars["--ads-color-border-subtle"]}`;

export const skillStyles = stylex.create({
  // ---- Instructions surface ---------------------------------------------
  instructionsSource: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-panel"],
    boxShadow: hairlineRing,
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    // 13px: the reading step between caption and body this pane has always used.
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "24px",
    minHeight: 0,
    overflowWrap: "break-word",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
    whiteSpace: "pre-wrap",
  },
  instructionsRendered: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-panel"],
    boxShadow: hairlineRing,
    color: vars["--ads-color-text"],
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  instructionsPreview: {
    backgroundColor: "transparent",
    flex: 1,
    minHeight: 0,
    overflow: "visible",
  },
  instructionsFill: { flex: 1, height: "100%", minHeight: "100%" },
  instructionsPreviewPane: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },

  // ---- Instructions dialog ----------------------------------------------
  dialog: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    height: "min(88vh, 56rem)",
    maxHeight: "88vh",
    maxWidth: "64rem",
    overflow: "hidden",
    padding: 0,
  },
  dialogHeader: {
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    paddingBlock: vars["--ads-space-20"],
    paddingInlineEnd: 56,
    paddingInlineStart: 28,
  },
  dialogTabs: { flex: 1, gap: 0, height: "100%", minHeight: 0 },
  dialogTabBar: {
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    paddingInline: 28,
  },
  /*
   * `dialogTabBar` owns the rule, because it is the one box that spans the
   * dialog; a `line` list is shrink-wrapped in a block container, so its own
   * inset hairline would stop after the last label. Suppressing that inset
   * rule removes the pair of stacked hairlines the strip used to draw, and the
   * hairline of negative end margin lets the 2px active bar paint over the
   * bar's rule instead of stacking a third mark on top of it.
   */
  dialogTabList: {
    borderRadius: 0,
    boxShadow: "none",
    gap: vars["--ads-space-20"],
    height: 44,
    marginBlockEnd: `calc(-1 * ${vars["--ads-border-width-hairline"]})`,
    padding: 0,
  },
  // No `height`: ADS stretches a `line` tab to its list, so the 44px strip
  // height is stated once, on the list, instead of on both boxes.
  dialogTab: { flex: "none", paddingInline: 0 },
  dialogPanel: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflow: "auto",
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-20"],
    "@media (min-width: 40rem)": { paddingInline: 28 },
  },
  dialogEmpty: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    justifyContent: "center",
    minHeight: 0,
    paddingBlock: vars["--ads-space-32"],
    paddingInline: 28,
  },

  // ---- Section header ----------------------------------------------------
  sectionHeader: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    paddingBottom: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-4"],
    paddingTop: vars["--ads-space-16"],
  },
  sectionTitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  sectionCount: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },

  // ---- Skill row ---------------------------------------------------------
  row: {
    [ROW_ACTION_OPACITY]: {
      default: "0",
      ":focus-within": "1",
      ":hover": "1",
    },
    [ROW_CHEVRON_NUDGE]: { default: "0px", ":hover": "2px" },
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":focus-within": vars["--ads-color-overlay-hover"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-4"],
    textAlign: "start",
    width: "100%",
  },
  // The surrounding row owns hover; its open target only arranges content.
  rowOpen: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--ads-space-12"],
    minWidth: 0,
  },
  rowScope: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    paddingTop: vars["--ads-space-2"],
  },
  rowScopeIcon: { color: vars["--ads-color-text-muted"], height: 14, width: 14 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  rowTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  rowBadge: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    height: 18,
    letterSpacing: "0.025em",
    paddingBlock: 0,
    paddingInline: 6,
    textTransform: "uppercase",
  },
  rowDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    opacity: `var(${ROW_ACTION_OPACITY})`,
  },
  rowChevron: {
    color: vars["--ads-color-text-subtle"],
    flexShrink: 0,
    height: 14,
    transform: `translateX(var(${ROW_CHEVRON_NUDGE}))`,
    width: 14,
  },
  iconButtonSm: { borderRadius: vars["--ads-radius-control"], height: 24, width: 24 },
  iconButtonMd: { borderRadius: vars["--ads-radius-control"], height: 28, width: 28 },
  glyphXs: { height: 12, width: 12 },
  glyphSm: { height: 14, width: 14 },
  glyphMd: { height: 16, width: 16 },
  spinning: {
    animationDuration: {
      default: vars["--ads-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },

  // ---- Metadata disclosure ----------------------------------------------
  details: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-panel"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  summary: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-canvas-subtle"],
    },
    borderRadius: vars["--ads-radius-panel"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    cursor: "pointer",
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    letterSpacing: "0.16em",
    listStyleType: "none",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
    textTransform: "uppercase",
    "::-webkit-details-marker": { display: "none" },
  },
  summaryChevron: {
    flexShrink: 0,
    height: 12,
    transform: "rotate(0deg)",
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "transform",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    width: 12,
  },
  summaryChevronOpen: { transform: "rotate(90deg)" },
  detailsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingBottom: 10,
    paddingInline: 10,
    paddingTop: vars["--ads-space-4"],
  },
  detailsRow: { display: "flex", gap: vars["--ads-space-8"] },
  detailsTerm: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontWeight: vars["--ads-font-weight-medium"],
  },
  detailsValue: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ---- Detail view -------------------------------------------------------
  detail: { display: "flex", flexDirection: "column", height: "100%" },
  detailHeader: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  detailTitle: {
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailMenu: { width: "13rem" },
  detailBody: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  detailColumn: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    height: "100%",
    minHeight: 0,
  },
  overview: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    minHeight: 0,
    paddingInlineEnd: vars["--ads-space-4"],
  },
  overviewScrolled: {
    flexShrink: 0,
    maxHeight: "42%",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBottom: vars["--ads-space-4"],
  },
  overviewFull: { flex: 1, overflowY: "auto" },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  detailBadge: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.025em",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-8"],
    textTransform: "uppercase",
  },
  field: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  fieldLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  fieldText: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  tokenRow: { alignItems: "center", display: "flex", gap: vars["--ads-space-8"] },
  tokenCode: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  insertButton: {
    borderRadius: vars["--ads-radius-control"],
    gap: 6,
    height: 28,
    paddingInline: vars["--ads-space-8"],
  },
  instructionsBlock: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minHeight: 0,
  },
  instructionsHead: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },

  // ---- Panel shell -------------------------------------------------------
  disabled: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
    paddingInline: vars["--ads-space-16"],
  },
  disabledEmpty: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  disabledAction: {
    borderRadius: vars["--ads-radius-control"],
    height: 32,
    marginTop: vars["--ads-space-4"],
  },
  disabledActionIcon: { height: 16, marginRight: vars["--ads-space-4"], width: 16 },
  panel: { display: "flex", flexDirection: "column", height: "100%" },
  panelHeader: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },
  panelHeaderText: { minWidth: 0 },
  panelCount: {
    color: vars["--ads-color-text"],
    display: "block",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  panelHint: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-micro"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  panelActions: { alignItems: "center", display: "flex", gap: 6 },
  searchSlot: {
    flexShrink: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  searchAnchor: { position: "relative" },
  searchIcon: {
    color: vars["--ads-color-text-muted"],
    height: 14,
    insetInlineStart: 14,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    // Fill and border come from the ADS field recipe so the search box reads
    // as a field in every theme instead of a tinted, borderless slab.
    fontSize: vars["--ads-font-size-body"],
    height: 32,
    paddingInlineEnd: 28,
    paddingInlineStart: 28,
  },
  searchClear: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    insetInlineEnd: 14,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    paddingBottom: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  listStatus: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-4"],
  },
  listEmpty: {
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-4"],
    textAlign: "center",
  },
  listEmptyText: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-body"] },
});
