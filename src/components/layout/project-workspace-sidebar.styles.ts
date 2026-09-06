import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Sidebar chrome. Colours come from ADS tokens; the alpha ramps that Tailwind
 * spelled as `bg-primary/12` are rebuilt with `color-mix` over a token so no
 * new colour is introduced.
 */
const accent10 = `color-mix(in srgb, ${vars.colorAccent} 10%, transparent)`;
const accent12 = `color-mix(in srgb, ${vars.colorAccent} 12%, transparent)`;
const accent16 = `color-mix(in srgb, ${vars.colorAccent} 16%, transparent)`;
const accent30 = `color-mix(in srgb, ${vars.colorAccent} 30%, transparent)`;
const accent40 = `color-mix(in srgb, ${vars.colorAccent} 40%, transparent)`;
const accent45 = `color-mix(in srgb, ${vars.colorAccent} 45%, transparent)`;

/** Tooltip surfaces paint on `colorText`, so their "background" tints mix toward it. */
const invertedText70 = `color-mix(in oklab, ${vars.colorTextInverted} 70%, ${vars.colorText})`;
const invertedFill10 = `color-mix(in oklab, ${vars.colorTextInverted} 10%, ${vars.colorText})`;
const invertedEdge20 = `color-mix(in oklab, ${vars.colorTextInverted} 20%, ${vars.colorText})`;

/**
 * Row-scoped reveal variables. StyleX conditions only see the element they are
 * declared on, so the former `group-hover/workspace-row:` and
 * `group-focus-within/project-row:` descendant selectors travel through custom
 * properties published by the row. DOM shape and the hover/focus rules are
 * unchanged — `:has(:focus-visible)` keeps the keyboard-only reveal that
 * `focus-within` would have widened.
 */
const ROW_ACTION_OPACITY = "--staveWorkspaceRowActionOpacity";
const ROW_ACTION_EVENTS = "--staveWorkspaceRowActionEvents";
const ROW_COUNT_OPACITY = "--staveWorkspaceRowCountOpacity";

const PROJECT_MARK_SCALE = "--staveProjectRowMarkScale";
const PROJECT_MARK_OPACITY = "--staveProjectRowMarkOpacity";
const PROJECT_CHEVRON_SCALE = "--staveProjectRowChevronScale";
const PROJECT_CHEVRON_OPACITY = "--staveProjectRowChevronOpacity";
const PROJECT_ROW_OPEN = "--staveProjectRowOpen";
const PROJECT_COUNT_OPACITY = "--staveProjectRowCountOpacity";
const PROJECT_COUNT_SHIFT = "--staveProjectRowCountShift";
const PROJECT_COUNT_EVENTS = "--staveProjectRowCountEvents";
const PROJECT_ACTIONS_OPACITY = "--staveProjectRowActionsOpacity";
const PROJECT_ACTIONS_SHIFT = "--staveProjectRowActionsShift";
const PROJECT_ACTIONS_EVENTS = "--staveProjectRowActionsEvents";

export const projectSidebarStyles = stylex.create({
  /* ---------------------------------------------------------------- labels */
  defaultBranchChip: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    backgroundColor: vars.colorCanvasSubtle,
    color: vars.colorTextMuted,
    display: "inline-flex",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    marginInlineStart: vars.space4,
    maxWidth: "5rem",
    overflow: "hidden",
    paddingBlock: 1,
    paddingInline: vars.space4,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /* --------------------------------------------------- hover preview tooltip */
  previewContent: {
    maxWidth: 260,
    overflowWrap: "break-word",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  previewStack: { display: "flex", flexDirection: "column", gap: vars.space8 },
  previewHeadStack: { display: "flex", flexDirection: "column", gap: 2 },
  previewBodyStack: { display: "flex", flexDirection: "column", gap: 6 },
  previewTaskStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  previewTitle: {
    color: vars.colorTextInverted,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
  },
  previewMeta: {
    color: invertedText70,
    fontSize: 11,
    lineHeight: vars.lineHeightTight,
  },
  previewMetaRow: {
    alignItems: "center",
    color: invertedText70,
    display: "flex",
    flexWrap: "wrap",
    fontSize: 11,
    gap: 6,
    lineHeight: vars.lineHeightTight,
  },
  previewRunningChip: {
    backgroundColor: invertedFill10,
    borderColor: invertedEdge20,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextInverted,
    fontWeight: vars.fontWeightMedium,
    paddingBlock: 2,
    paddingInline: vars.space4,
  },
  previewTaskTitle: {
    color: vars.colorTextInverted,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1rem",
  },
  previewShortcutChip: {
    height: 16,
    fontSize: vars.fontSizeMicro,
    marginBlockStart: 2,
    paddingInline: vars.space4,
  },

  /* ------------------------------------------------------ status iconography */
  statusMuted: { color: vars.colorTextMuted },
  statusIcon: { height: 16, width: 16 },
  statusIconWarning: { color: vars.colorWarning, height: 16, width: 16 },
  statusIconDanger: { color: vars.colorDanger, height: 16, width: 16 },
  statusIconSuccess: { color: vars.colorSuccess, height: 16, width: 16 },
  identityMark: { borderRadius: vars.radiusMark, height: 16, width: 16 },
  identityMarkIcon: { height: 10, width: 10 },
  toneAccent: { color: vars.colorAccent },
  toneWarning: { color: vars.colorWarning },
  toneClaude: { color: "var(--provider-claude)" },
  toneCodex: { color: "var(--provider-codex)" },

  /* -------------------------------------------------------- work-queue rows */
  queueRow: { minWidth: 0 },
  queueButton: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    height: 32,
    minWidth: 0,
    paddingInline: vars.space8,
    width: "100%",
  },
  queueButtonActive: { backgroundColor: accent12, color: vars.colorText },
  queueButtonIdle: {
    backgroundColor: { default: null, ":hover": vars.colorSelectionFill },
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  queueLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "left",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  queueProject: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  laneStack: { display: "flex", flexDirection: "column", gap: 2 },
  laneButton: {
    alignItems: "center",
    backgroundColor: { default: null, ":hover": vars.colorSelectionFill },
    borderRadius: vars.radiusControl,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    display: "flex",
    fontSize: 11,
    fontWeight: vars.fontWeightSemibold,
    gap: 6,
    height: 28,
    letterSpacing: "0.18em",
    paddingInline: vars.space8,
    textTransform: "uppercase",
    width: "100%",
  },
  laneChevron: { flexShrink: 0, height: 12, width: 12 },
  laneLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "left",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  laneCount: { flexShrink: 0, fontVariantNumeric: "tabular-nums" },

  /* -------------------------------------------------- project attention mark */
  attentionDot: {
    backgroundColor: vars.colorTextSubtle,
    borderRadius: vars.radiusFull,
    height: 6,
    width: 6,
  },
  attentionIconWarning: { color: vars.colorWarning, height: 14, width: 14 },
  attentionIconDanger: { color: vars.colorDanger, height: 14, width: 14 },
  attentionSlot: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: 2,
    height: 20,
    justifyContent: "center",
    marginInlineStart: "auto",
    paddingInline: 2,
  },
  attentionCount: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
  },

  /* ------------------------------------------------- responding count badge */
  respondingSlot: {
    alignItems: "center",
    display: "flex",
    height: 28,
    justifyContent: "center",
    minWidth: 28,
    paddingInlineEnd: vars.space4,
  },
  respondingBadge: {
    backgroundColor: accent10,
    borderColor: accent30,
    borderRadius: vars.radiusMark,
    color: vars.colorAccent,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
    justifyContent: "center",
    minWidth: 28,
    paddingBlock: 2,
    paddingInline: 6,
  },
  respondingBadgeInline: {
    backgroundColor: accent10,
    borderColor: accent30,
    borderRadius: vars.radiusMark,
    color: vars.colorAccent,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
    height: 16,
    justifyContent: "center",
    minWidth: 20,
    paddingInline: vars.space4,
  },

  /* --------------------------------------------------- inline workspace label */
  labelInput: {
    backgroundColor: vars.colorCanvas,
    fontSize: vars.fontSizeBody,
    height: 28,
    minWidth: 0,
    paddingInline: vars.space8,
  },
  labelInputCompact: { flex: 1 },
  labelInputWide: { width: "100%" },
  label: {
    lineHeight: "1.25rem",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  labelCompact: { flex: 1 },
  labelRoomy: { paddingInlineEnd: vars.space32 },
  labelActive: { color: vars.colorText, fontWeight: vars.fontWeightMedium },
  labelEditable: {
    backgroundColor: { default: null, ":hover": vars.colorOverlayHover },
    borderRadius: vars.radiusMark,
    cursor: "text",
    outline: "none",
  },

  /* ------------------------------------------------------ expanded row meta */
  metaGrid: {
    alignItems: "center",
    color: vars.colorTextMuted,
    columnGap: vars.space8,
    display: "grid",
    fontSize: 11,
    gridColumn: "span 2",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    lineHeight: "1rem",
    minWidth: 0,
  },
  metaIconSlot: {
    alignItems: "center",
    display: "flex",
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  metaIcon: {
    color: vars.colorTextSubtle,
    flexShrink: 0,
    height: 16,
    width: 16,
  },
  metaBody: { alignItems: "center", display: "flex", gap: 6, minWidth: 0 },
  metaBranch: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
    marginInlineStart: "auto",
  },
  metaShortcutChip: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    height: 16,
    paddingInline: vars.space4,
  },

  /* ------------------------------------------------------------ sortable row */
  sortableRow: { position: "relative" },
  sortableRowDragging: { opacity: 0.5 },

  /* ------------------------------------------------------ workspace row actions */
  rowActions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
    position: "absolute",
  },
  rowActionsTop: { insetBlockStart: 6, insetInlineEnd: vars.space4 },
  rowActionsInline: {
    insetBlockEnd: 0,
    insetBlockStart: 0,
    insetInlineEnd: 0,
    paddingInlineEnd: vars.space4,
  },
  rowActionsPinned: { opacity: 1, pointerEvents: "auto" },
  rowActionsReveal: {
    opacity: `var(${ROW_ACTION_OPACITY}, 0)`,
    pointerEvents: `var(${ROW_ACTION_EVENTS}, none)`,
  },
  rowCountHidden: { opacity: 0 },
  rowCountYields: { opacity: `var(${ROW_COUNT_OPACITY}, 1)` },
  rowActionsShortcut: { flexShrink: 0 },
  rowActionsTrigger: {
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    height: 28,
    padding: 0,
    width: 28,
  },
  rowActionsIcon: { height: 14, width: 14 },

  /* -------------------------------------------------------------- sidebar shell */
  aside: {
    display: { default: "none", "@media (min-width: 64rem)": "flex" },
    flexDirection: "column",
    flexShrink: 0,
    height: "100%",
    overflow: "hidden",
    position: "relative",
    color: vars.colorText,
    zIndex: 0,
  },
  chrome: {
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
  },
  chromeCollapsed: {
    borderBottomColor: vars.colorBorderSubtle,
    paddingBottom: vars.space12,
    paddingInline: vars.space8,
  },
  chromeExpanded: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    display: "flex",
    flexShrink: 0,
    height: 48,
    paddingInline: vars.space12,
  },
  columnCenter: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
  },
  columnCenterGap: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  chromeTrailing: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "flex-end",
    width: "100%",
  },
  collapsedPrimaryButton: {
    backgroundColor: {
      default: vars.colorOverlayHover,
      ":hover": vars.colorSelectionFill,
    },
    borderRadius: vars.radiusControl,
    height: 40,
    padding: 0,
    width: 40,
  },
  collapsedButton: {
    borderRadius: vars.radiusControl,
    height: 40,
    padding: 0,
    width: 40,
  },
  collapsedButtonActive: {
    backgroundColor: vars.colorSelectionFill,
    color: vars.colorText,
  },
  collapsedButtonIdle: {
    backgroundColor: { default: null, ":hover": vars.colorSelectionFill },
  },
  chromeButton: {
    borderRadius: vars.radiusControl,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    backgroundColor: { default: null, ":hover": vars.colorOverlayHover },
    height: 32,
    padding: 0,
    width: 32,
  },
  chromeButtonSidebar: {
    backgroundColor: { default: null, ":hover": vars.colorSelectionFill },
    borderRadius: vars.radiusControl,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    height: 32,
    padding: 0,
    width: 32,
  },
  iconMd: { height: 16, width: 16 },
  iconSm: { height: 14, width: 14 },
  triggerHost: { display: "inline-flex" },

  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
  },
  scrollAreaExpanded: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlockEnd: vars.space8,
    paddingBlockStart: 6,
    paddingInline: vars.space8,
  },
  collapsedEntry: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  collapsedGroupRule: {
    backgroundColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFull,
    height: 1,
    marginBlockEnd: vars.space8,
    width: 20,
  },
  collapsedWorkspaceButton: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  collapsedWorkspaceActive: {
    backgroundColor: accent10,
    borderColor: accent40,
    color: vars.colorAccent,
  },
  collapsedWorkspaceIdle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorSelectionFill,
    },
    borderColor: { default: "transparent", ":hover": vars.colorBorder },
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },

  navStack: { display: "flex", flexDirection: "column", gap: 2 },
  navStackSpaced: { marginBlockEnd: vars.space8 },
  navButton: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    height: 32,
    paddingInline: vars.space8,
    width: "100%",
  },
  navButtonActive: {
    backgroundColor: vars.colorSelectionFill,
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  navButtonIdle: {
    backgroundColor: { default: null, ":hover": vars.colorSelectionFill },
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },

  viewBar: {
    alignItems: "center",
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    justifyContent: "space-between",
    marginBlockEnd: 6,
    paddingInline: vars.space8,
  },
  viewToggle: {
    alignItems: "center",
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: 2,
    padding: 2,
  },
  viewToggleButton: { borderRadius: 5, height: 24, padding: 0, width: 28 },
  viewToggleButtonActive: {
    backgroundColor: vars.colorSelectionFill,
    color: vars.colorText,
  },
  viewToggleButtonIdle: {
    backgroundColor: { default: null, ":hover": vars.colorOverlayHover },
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  viewBarActions: { alignItems: "center", display: "flex", gap: vars.space4 },
  displayModeMenu: { width: 176 },

  searchRow: {
    marginBlockEnd: vars.space8,
    paddingInline: vars.space8,
    position: "relative",
  },
  searchIcon: {
    color: vars.colorTextSubtle,
    height: 14,
    insetBlockStart: "50%",
    insetInlineStart: vars.space16,
    pointerEvents: "none",
    position: "absolute",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    backgroundColor: "transparent",
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    fontSize: vars.fontSizeCaption,
    height: 32,
    paddingInlineEnd: 28,
    paddingInlineStart: 28,
  },
  searchClear: {
    borderRadius: vars.radiusControl,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    height: 24,
    insetBlockStart: "50%",
    insetInlineEnd: vars.space12,
    padding: 0,
    position: "absolute",
    transform: "translateY(-50%)",
    width: 24,
  },

  emptyState: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space16,
    paddingInline: vars.space12,
  },

  projectStack: { display: "flex", flexDirection: "column", gap: vars.space12 },
  projectSectionDragging: {
    backgroundColor: vars.colorSelectionFill,
    borderRadius: vars.radiusControl,
  },
  projectHeaderRow: { alignItems: "center", display: "flex", gap: vars.space4 },

  projectRow: {
    [PROJECT_ROW_OPEN]: { default: "0", ":hover": "1", ":focus-within": "1" },
    [PROJECT_MARK_SCALE]: {
      default: "1",
      ":hover": "0.75",
      ":focus-within": "0.75",
    },
    [PROJECT_MARK_OPACITY]: {
      default: "1",
      ":hover": "0",
      ":focus-within": "0",
    },
    [PROJECT_CHEVRON_SCALE]: {
      default: "0.75",
      ":hover": "1",
      ":focus-within": "1",
    },
    [PROJECT_CHEVRON_OPACITY]: {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
    [PROJECT_COUNT_OPACITY]: {
      default: "1",
      ":hover": "0",
      ":focus-within": "0",
    },
    [PROJECT_COUNT_SHIFT]: {
      default: "0px",
      ":hover": "0.25rem",
      ":focus-within": "0.25rem",
    },
    [PROJECT_COUNT_EVENTS]: {
      default: "auto",
      ":hover": "none",
      ":focus-within": "none",
    },
    [PROJECT_ACTIONS_OPACITY]: {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
    [PROJECT_ACTIONS_SHIFT]: {
      default: "0.25rem",
      ":hover": "0px",
      ":focus-within": "0px",
    },
    [PROJECT_ACTIONS_EVENTS]: {
      default: "none",
      ":hover": "auto",
      ":focus-within": "auto",
    },
    alignItems: "center",
    backgroundColor: {
      default: null,
      ":hover": vars.colorSelectionFill,
      ":focus-within": vars.colorSelectionFill,
    },
    borderRadius: vars.radiusControl,
    color: { default: null, ":hover": vars.colorText },
    display: "flex",
    flex: 1,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    minWidth: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
    textAlign: "left",
  },
  projectRowDraggable: {
    cursor: { default: "pointer", ":active": "grabbing" },
  },
  projectRowDragging: { cursor: "grabbing" },
  projectToggle: {
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: 32,
    padding: 0,
    position: "relative",
    width: 32,
  },
  projectMark: {
    height: 28,
    opacity: `var(${PROJECT_MARK_OPACITY}, 1)`,
    transform: `scale(var(${PROJECT_MARK_SCALE}, 1))`,
    transitionDuration: "200ms",
    transitionProperty: "opacity, transform",
    width: 28,
  },
  projectMarkIcon: { height: 14, width: 14 },
  projectChevronSlot: {
    alignItems: "center",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
  },
  projectChevron: {
    height: 16,
    opacity: `var(${PROJECT_CHEVRON_OPACITY}, 0)`,
    transform: `scale(var(${PROJECT_CHEVRON_SCALE}, 0.75))`,
    transitionDuration: "200ms",
    transitionProperty: "opacity, transform",
    width: 16,
  },
  projectLead: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars.space8,
    minWidth: 0,
    position: "relative",
    transitionDuration: "200ms",
    transitionProperty: "padding",
  },
  /* Hover reserves room for the absolutely positioned row actions; a pinned
     attention alert needs its own slot beyond them. */
  projectLeadPinned: {
    paddingInlineEnd: `calc(var(${PROJECT_ROW_OPEN}, 0) * 7.75rem)`,
  },
  projectLeadDefault: {
    paddingInlineEnd: `calc(var(${PROJECT_ROW_OPEN}, 0) * 5.75rem)`,
  },
  projectName: {
    flex: 1,
    fontWeight: vars.fontWeightMedium,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectCountSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    marginInlineStart: "auto",
    transitionDuration: "200ms",
    transitionProperty: "opacity, transform",
  },
  projectCountSlotYields: {
    opacity: `var(${PROJECT_COUNT_OPACITY}, 1)`,
    pointerEvents: `var(${PROJECT_COUNT_EVENTS}, auto)`,
    transform: `translateX(var(${PROJECT_COUNT_SHIFT}, 0px))`,
  },
  projectCount: {
    alignItems: "center",
    backgroundColor: vars.colorOverlayHover,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    display: "inline-flex",
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingInline: 6,
  },
  projectActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 2,
    insetBlockStart: "50%",
    insetInlineEnd: 0,
    opacity: `var(${PROJECT_ACTIONS_OPACITY}, 0)`,
    pointerEvents: `var(${PROJECT_ACTIONS_EVENTS}, none)`,
    position: "absolute",
    transform: `translateY(-50%) translateX(var(${PROJECT_ACTIONS_SHIFT}, 0.25rem))`,
    transitionDuration: "200ms",
    transitionProperty: "opacity, transform",
  },
  projectActionButton: {
    borderRadius: vars.radiusControl,
    height: 28,
    padding: 0,
    width: 28,
  },
  projectDragPreviewMark: {
    borderRadius: vars.radiusControl,
    height: 20,
    width: 20,
  },
  projectDragPreviewIcon: { height: 12, width: 12 },

  workspaceList: { paddingBlockEnd: vars.space4, paddingBlockStart: 2 },
  workspaceListInner: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  workspaceItem: { minWidth: 0 },

  workspaceRow: {
    [ROW_ACTION_OPACITY]: {
      default: "0",
      ":hover": "1",
      ":has(:focus-visible)": "1",
    },
    [ROW_ACTION_EVENTS]: {
      default: "none",
      ":hover": "auto",
      ":has(:focus-visible)": "auto",
    },
    [ROW_COUNT_OPACITY]: {
      default: "1",
      ":hover": "0",
      ":has(:focus-visible)": "0",
    },
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    position: "relative",
    transitionDuration: vars.motionDurationFast,
    transitionProperty: "background-color, border-color, box-shadow, color",
  },
  workspaceRowExpanded: { alignItems: "stretch", gap: vars.space4 },
  workspaceRowCompact: { alignItems: "center", gap: vars.space4 },
  workspaceRowActive: {
    backgroundColor: { default: accent12, ":hover": accent16 },
    borderColor: accent45,
    boxShadow: vars.elevationRaised,
    color: vars.colorText,
    "::before": {
      borderLeftColor: vars.colorAccent,
      borderLeftStyle: "solid",
      borderLeftWidth: 2,
      borderTopColor: vars.colorAccent,
      borderTopLeftRadius: vars.radiusMark,
      borderTopStyle: "solid",
      borderTopWidth: 2,
      content: "''",
      height: 12,
      insetBlockStart: -1,
      insetInlineStart: -1,
      pointerEvents: "none",
      position: "absolute",
      width: 12,
    },
  },
  workspaceRowIdle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorSelectionFill,
    },
    borderColor: { default: "transparent", ":hover": vars.colorBorderSubtle },
    color: { default: null, ":hover": vars.colorText },
  },
  workspaceRowDragging: {
    backgroundColor: vars.colorSelectionFill,
    borderColor: vars.colorBorderSubtle,
    boxShadow: vars.elevationRaised,
  },
  workspaceOpen: {
    flex: 1,
    fontSize: vars.fontSizeBody,
    minWidth: 0,
    textAlign: "left",
  },
  workspaceOpenExpanded: {
    alignItems: "start",
    columnGap: vars.space8,
    display: "grid",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    paddingBlock: 10,
    paddingInline: vars.space12,
    rowGap: vars.space4,
  },
  workspaceOpenCompact: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  workspaceOpenDraggable: {
    cursor: { default: "pointer", ":active": "grabbing" },
  },
  workspaceOpenDragging: { cursor: "grabbing" },
  workspaceLeadSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  workspaceLeadSlotExpanded: { marginBlockStart: 2 },
  workspaceCountHost: { flexShrink: 0, position: "relative" },

  footer: {
    borderTopColor: vars.colorBorderSubtle,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
  },
  footerCollapsed: { paddingBlock: vars.space8, paddingInline: vars.space8 },
  footerExpanded: { paddingBlock: vars.space8, paddingInline: vars.space12 },
  footerRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "space-between",
  },
  footerGroup: { alignItems: "center", display: "flex", gap: vars.space8 },

  archiveOption: {
    alignItems: "center",
    backgroundColor: { default: null, ":hover": vars.colorOverlayHover },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    cursor: "pointer",
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  archiveCheckbox: { accentColor: vars.colorDanger },
  archiveLabelOn: { color: vars.colorDangerText },
  archiveLabelOff: { color: vars.colorTextMuted },
});
