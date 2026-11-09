import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

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

const hairlineRing = `0 0 0 1px ${vars["--aui-color-border-subtle"]}`;

export const skillStyles = stylex.create({
  // ---- Instructions surface ---------------------------------------------
  instructionsSource: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-panel"],
    boxShadow: hairlineRing,
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    // 13px: the reading step between caption and body this pane has always used.
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "24px",
    minHeight: 0,
    overflowWrap: "break-word",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
    whiteSpace: "pre-wrap",
  },
  instructionsRendered: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-panel"],
    boxShadow: hairlineRing,
    color: vars["--aui-color-text"],
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
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
    paddingInline: vars["--aui-space-12"],
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
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    flexShrink: 0,
    paddingBlock: vars["--aui-space-20"],
    paddingInlineEnd: 56,
    paddingInlineStart: 28,
  },
  dialogTabs: { flex: 1, gap: 0, height: "100%", minHeight: 0 },
  dialogTabBar: {
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
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
    gap: vars["--aui-space-20"],
    height: 44,
    marginBlockEnd: `calc(-1 * ${vars["--aui-border-width-hairline"]})`,
    padding: 0,
  },
  // No `height`: AUI stretches a `line` tab to its list, so the 44px strip
  // height is stated once, on the list, instead of on both boxes.
  dialogTab: { flex: "none", paddingInline: 0 },
  dialogPanel: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflow: "auto",
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-20"],
    "@media (min-width: 40rem)": { paddingInline: 28 },
  },
  dialogEmpty: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    justifyContent: "center",
    minHeight: 0,
    paddingBlock: vars["--aui-space-32"],
    paddingInline: 28,
  },

  // ---- Section header ----------------------------------------------------
  sectionHeader: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    paddingBottom: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-4"],
    paddingTop: vars["--aui-space-16"],
  },
  sectionTitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  sectionCount: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
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
      ":focus-within": vars["--aui-color-overlay-hover"],
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-4"],
    textAlign: "start",
    width: "100%",
  },
  // The surrounding row owns hover; its open target only arranges content.
  rowOpen: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--aui-space-12"],
    minWidth: 0,
  },
  rowScope: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    paddingTop: vars["--aui-space-2"],
  },
  rowScopeIcon: { color: vars["--aui-color-text-muted"], height: 14, width: 14 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  rowTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  rowBadge: {
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-micro"],
    height: 18,
    letterSpacing: "0.025em",
    paddingBlock: 0,
    paddingInline: 6,
    textTransform: "uppercase",
  },
  rowDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-2"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
    opacity: `var(${ROW_ACTION_OPACITY})`,
  },
  rowChevron: {
    color: vars["--aui-color-text-subtle"],
    flexShrink: 0,
    height: 14,
    transform: `translateX(var(${ROW_CHEVRON_NUDGE}))`,
    width: 14,
  },
  iconButtonSm: { borderRadius: vars["--aui-radius-control"], height: 24, width: 24 },
  iconButtonMd: { borderRadius: vars["--aui-radius-control"], height: 28, width: 28 },
  glyphXs: { height: 12, width: 12 },
  glyphSm: { height: 14, width: 14 },
  glyphMd: { height: 16, width: 16 },
  spinning: {
    animationDuration: {
      default: vars["--aui-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },

  // ---- Metadata disclosure ----------------------------------------------
  details: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-panel"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  summary: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-canvas-subtle"],
    },
    borderRadius: vars["--aui-radius-panel"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    cursor: "pointer",
    display: "flex",
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-8"],
    letterSpacing: "0.16em",
    listStyleType: "none",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 10,
    textTransform: "uppercase",
    "::-webkit-details-marker": { display: "none" },
  },
  summaryChevron: {
    flexShrink: 0,
    height: 12,
    transform: "rotate(0deg)",
    transitionDuration: {
      default: vars["--aui-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "transform",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
    width: 12,
  },
  summaryChevronOpen: { transform: "rotate(90deg)" },
  detailsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingBottom: 10,
    paddingInline: 10,
    paddingTop: vars["--aui-space-4"],
  },
  detailsRow: { display: "flex", gap: vars["--aui-space-8"] },
  detailsTerm: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontWeight: vars["--aui-font-weight-medium"],
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
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  detailTitle: {
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
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
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  detailColumn: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
    height: "100%",
    minHeight: 0,
  },
  overview: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
    minHeight: 0,
    paddingInlineEnd: vars["--aui-space-4"],
  },
  overviewScrolled: {
    flexShrink: 0,
    maxHeight: "42%",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBottom: vars["--aui-space-4"],
  },
  overviewFull: { flex: 1, overflowY: "auto" },
  badgeRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  detailBadge: {
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.025em",
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-8"],
    textTransform: "uppercase",
  },
  field: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"] },
  fieldLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  fieldText: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },
  tokenRow: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"] },
  tokenCode: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  insertButton: {
    borderRadius: vars["--aui-radius-control"],
    gap: 6,
    height: 28,
    paddingInline: vars["--aui-space-8"],
  },
  instructionsBlock: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-4"],
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
    paddingInline: vars["--aui-space-16"],
  },
  disabledEmpty: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border-subtle"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  disabledAction: {
    borderRadius: vars["--aui-radius-control"],
    height: 32,
    marginTop: vars["--aui-space-4"],
  },
  disabledActionIcon: { height: 16, marginRight: vars["--aui-space-4"], width: 16 },
  panel: { display: "flex", flexDirection: "column", height: "100%" },
  panelHeader: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: vars["--aui-space-12"],
  },
  panelHeaderText: { minWidth: 0 },
  panelCount: {
    color: vars["--aui-color-text"],
    display: "block",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  panelHint: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  panelActions: { alignItems: "center", display: "flex", gap: 6 },
  searchSlot: {
    flexShrink: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  searchAnchor: { position: "relative" },
  searchIcon: {
    color: vars["--aui-color-text-muted"],
    height: 14,
    insetInlineStart: 14,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    // Fill and border come from the AUI field recipe so the search box reads
    // as a field in every theme instead of a tinted, borderless slab.
    fontSize: vars["--aui-font-size-body"],
    height: 32,
    paddingInlineEnd: 28,
    paddingInlineStart: 28,
  },
  searchClear: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    insetInlineEnd: 14,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    paddingBottom: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  listStatus: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-4"],
  },
  listEmpty: {
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-4"],
    textAlign: "center",
  },
  listEmptyText: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-body"] },
});
