import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/**
 * Sidebar chrome. Colours come from AUI tokens; the alpha ramps that Tailwind
 * spelled as `bg-primary/12` are rebuilt with `color-mix` over a token so no
 * new colour is introduced.
 */
const accent10 = `color-mix(in srgb, ${vars["--aui-color-accent"]} 10%, transparent)`;
const accent16 = `color-mix(in srgb, ${vars["--aui-color-accent"]} 16%, transparent)`;
const accent20 = `color-mix(in srgb, ${vars["--aui-color-accent"]} 20%, transparent)`;
const accent40 = `color-mix(in srgb, ${vars["--aui-color-accent"]} 40%, transparent)`;
/*
 * The active workspace in two tones: its open tasks on a light 7% wash, its
 * row on 10% over that. Stacked, the row reads about 16% at rest and 20% on
 * hover, the fills a selected row had before it was grouped.
 */
const accent07 = `color-mix(in srgb, ${vars["--aui-color-accent"]} 7%, transparent)`;
const accent14 = `color-mix(in srgb, ${vars["--aui-color-accent"]} 14%, transparent)`;

/**
 * The sidebar's hover-reveal beat: the project mark trading places with its
 * chevron, the row actions sliding in and the count yielding to them (the
 * lead's padding opens in one step; it is layout). They were authored as a bare
 * `transitionDuration` literal with NO timing function, which means they ran on
 * the UA's `ease` rather than the house curve — the sidebar was the one surface
 * in the app whose hovers accelerated differently from every button beside it —
 * and with no `prefers-reduced-motion` arm at all, so the transform halves kept
 * playing for a reader who had asked them not to. One tokenized object, spread
 * into each, so they cannot drift again.
 *
 * `motionDurationNormal` (180ms) is the token nearest the hand-picked value;
 * the spatial arm collapses to `0ms` under Reduce Motion exactly as
 * `recipes/transition`'s own `transform` key does.
 */
const revealMotion = {
  transitionDuration: {
    default: vars["--aui-motion-duration-normal"],
    "@media (prefers-reduced-motion: reduce)": "0ms",
  },
  transitionTimingFunction: vars["--aui-motion-ease-standard"],
} as const;

/**
 * Muted measures 4.51:1 on the light sidebar ground and 4.15:1 under the
 * selected-row wash, below the 4.5:1 small-text floor; a 30% ink step reads
 * 6.01:1 there and only lightens further in dark mode.
 */
const rowSecondaryInk = `color-mix(in oklab, ${vars["--aui-color-text"]} 30%, ${vars["--aui-color-text-muted"]})`;

/** Tooltip surfaces paint on `colorText`, so their "background" tints mix toward it. */
const invertedText70 = `color-mix(in oklab, ${vars["--aui-color-text-inverted"]} 70%, ${vars["--aui-color-text"]})`;
const invertedFill10 = `color-mix(in oklab, ${vars["--aui-color-text-inverted"]} 10%, ${vars["--aui-color-text"]})`;
const invertedEdge20 = `color-mix(in oklab, ${vars["--aui-color-text-inverted"]} 20%, ${vars["--aui-color-text"]})`;

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
/**
 * The room the revealed actions take at the row's end. Published as a width
 * so the row's own content steps aside for the menu instead of running under
 * it: the trigger plus the inline padding after it.
 */
const ROW_ACTION_RESERVE = "--staveWorkspaceRowActionReserve";
const ROW_ACTION_BOX = `calc(28px + ${vars["--aui-space-4"]})`;
/** A row whose menu is open or whose workspace is closing keeps its actions shown. */
const ROW_ACTIONS_PINNED = ":has([data-row-actions-pinned])";

const REPOSITORY_MARK_SCALE = "--staveProjectRowMarkScale";
const REPOSITORY_MARK_OPACITY = "--staveProjectRowMarkOpacity";
const REPOSITORY_CHEVRON_SCALE = "--staveProjectRowChevronScale";
const REPOSITORY_CHEVRON_OPACITY = "--staveProjectRowChevronOpacity";
const REPOSITORY_ROW_OPEN = "--staveProjectRowOpen";
const REPOSITORY_COUNT_OPACITY = "--staveProjectRowCountOpacity";
const REPOSITORY_COUNT_SHIFT = "--staveProjectRowCountShift";
const REPOSITORY_COUNT_EVENTS = "--staveProjectRowCountEvents";
const REPOSITORY_ACTIONS_OPACITY = "--staveProjectRowActionsOpacity";
const REPOSITORY_ACTIONS_SHIFT = "--staveProjectRowActionsShift";
const REPOSITORY_ACTIONS_EVENTS = "--staveProjectRowActionsEvents";

export const repositorySidebarStyles = stylex.create({
  /* ---------------------------------------------------------------- labels */
  defaultBranchChip: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    marginInlineStart: vars["--aui-space-4"],
    maxWidth: "5rem",
    overflow: "hidden",
    paddingBlock: 1,
    paddingInline: vars["--aui-space-4"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /* --------------------------------------------------- hover preview tooltip */
  previewContent: {
    maxWidth: 260,
    overflowWrap: "break-word",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  previewStack: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  previewHeadStack: { display: "flex", flexDirection: "column", gap: 2 },
  previewBodyStack: { display: "flex", flexDirection: "column", gap: 6 },
  previewTaskStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  previewTitle: {
    color: vars["--aui-color-text-inverted"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  previewMeta: {
    color: invertedText70,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  previewMetaRow: {
    alignItems: "center",
    color: invertedText70,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
    lineHeight: vars["--aui-line-height-tight"],
  },
  previewRunningChip: {
    backgroundColor: invertedFill10,
    borderColor: invertedEdge20,
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-inverted"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: 2,
    paddingInline: vars["--aui-space-4"],
  },
  // The hover preview's row title, so it takes the row-title step; the 16px
  // literal leading was sized for Caption and clipped 14px descenders.
  previewTaskTitle: {
    color: vars["--aui-color-text-inverted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  previewShortcutChip: {
    alignSelf: "flex-end",
    height: 16,
    fontSize: vars["--aui-font-size-micro"],
    marginBlockStart: 2,
    paddingInline: vars["--aui-space-4"],
  },

  /* ------------------------------------------------------ status iconography */
  statusMuted: { color: vars["--aui-color-text-muted"] },
  statusIcon: { height: 16, width: 16 },
  statusIconWarning: { color: vars["--aui-color-warning"], height: 16, width: 16 },
  statusIconDanger: { color: vars["--aui-color-danger"], height: 16, width: 16 },
  statusIconGitOpen: {
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 45%, var(--service-git-open))`,
    height: 16,
    width: 16,
  },
  statusIconGitClosed: {
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 45%, var(--service-git-closed))`,
    height: 16,
    width: 16,
  },
  statusIconGitModified: {
    color: `color-mix(in oklab, ${vars["--aui-color-text"]} 45%, var(--service-git-modified))`,
    height: 16,
    width: 16,
  },
  identityMark: { borderRadius: vars["--aui-radius-mark"], height: 16, width: 16 },
  identityMarkIcon: { height: 10, width: 10 },
  toneAccent: { color: vars["--aui-color-accent"] },
  toneWarning: { color: vars["--aui-color-warning"] },

  /* ------------------------------------------- shared workspace row (both views) */
  /*
   * One row for the repository tree and the Work queue, so both views read at
   * the same comfortable height: `controlHeightLg` is 40px, and 36px under the
   * compact UI density, which shifts that rung. The whole row is the hit area;
   * the title holds one line and anything secondary is muted beside or under it.
   */
  row: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    height: vars["--aui-control-height-lg"],
    minWidth: 0,
    position: "relative",
  },
  rowHit: {
    alignItems: "center",
    alignSelf: "stretch",
    display: "flex",
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingInline: vars["--aui-space-12"],
    textAlign: "left",
    width: "100%",
  },
  rowTitle: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 1,
    lineHeight: vars["--aui-line-height-control"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** Keep the title, separator and branch centered on one line. */
  rowIdentity: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  rowSeparator: {
    color: rowSecondaryInk,
    flexShrink: 0,
  },
  rowSecondary: {
    color: rowSecondaryInk,
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 1000,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /* -------------------------------------------------------- work-queue rows */
  queueRow: { minWidth: 0 },
  /**
   * The active workspace's row and its open tasks share one selection: a
   * light wash under both, the row deeper on top, so the tasks read as part of
   * the selected workspace and still sit a step below its title.
   */
  workspaceGroupActive: {
    backgroundColor: accent07,
    borderRadius: vars["--aui-radius-control"],
  },
  /** The row's button and its hover menu; reveals the menu like a tree row. */
  queueItem: {
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
    [ROW_ACTION_RESERVE]: {
      default: "0px",
      ":hover": ROW_ACTION_BOX,
      ":has(:focus-visible)": ROW_ACTION_BOX,
      [ROW_ACTIONS_PINNED]: ROW_ACTION_BOX,
    },
    minWidth: 0,
    position: "relative",
  },
  /** Inline secondary text sits at the row's trailing edge, before its counts. */
  rowSecondaryTrailing: { marginInlineStart: "auto" },
  laneStack: { display: "flex", flexDirection: "column", gap: 2 },
  // Both the lane's section header and its collapse target, so it is held to
  // the section-header step: Micro plus uppercase plus 0.18em tracking made a
  // full-width click target out of the rail's smallest, widest-set line. The
  // box is `controlHeightXs` by token so the density axis reaches it.
  laneButton: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    borderRadius: vars["--aui-radius-control"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    gap: 6,
    height: vars["--aui-control-height-xs"],
    paddingInline: vars["--aui-space-8"],
    width: "100%",
  },
  /*
   * ONE chevron that rotates, not two chevrons that swap.
   *
   * This slot rendered `<ChevronRight>` or `<ChevronDown>` on a ternary, which
   * replaces the DOM node on every toggle — so there was no transform to
   * interpolate and the arrow popped between the two directions while the row
   * it belongs to fades its fill on the house curve. `transition.transform`
   * (composed at the call site) supplies the duration, curve and the
   * reduced-motion arm; these two keys supply only the geometry.
   */
  laneChevron: {
    flexShrink: 0,
    height: vars["--aui-control-icon-size-sm"],
    transform: "rotate(0deg)",
    width: vars["--aui-control-icon-size-sm"],
  },
  laneChevronOpen: { transform: "rotate(90deg)" },
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
    backgroundColor: vars["--aui-color-text-subtle"],
    borderRadius: vars["--aui-radius-full"],
    height: 6,
    width: 6,
  },
  attentionIconWarning: { color: vars["--aui-color-warning"], height: 14, width: 14 },
  attentionIconDanger: { color: vars["--aui-color-danger"], height: 14, width: 14 },
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
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
  },

  /* ------------------------------------------------- responding count badge */
  respondingSlot: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    height: 28,
    justifyContent: "flex-end",
    minWidth: 28,
    paddingInlineEnd: vars["--aui-space-4"],
  },
  /**
   * The running count, set like the repository row's workspace count: muted
   * micro numerals, right-aligned with it, no chip. Only the unanswered count
   * beside it is a badge, because it is the one that needs the user.
   */
  respondingCount: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
    height: 20,
    justifyContent: "flex-end",
    minWidth: 20,
    paddingInlineEnd: vars["--aui-space-4"],
  },
  respondingBadgeInline: {
    borderRadius: vars["--aui-radius-mark"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
    height: 16,
    justifyContent: "center",
    minWidth: 20,
    paddingInline: vars["--aui-space-4"],
  },

  /* --------------------------------------------------- inline workspace label */
  labelInput: {
    backgroundColor: vars["--aui-color-canvas"],
    fontSize: vars["--aui-font-size-body"],
    height: 28,
    minWidth: 0,
    paddingInline: vars["--aui-space-8"],
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
  labelActive: { color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"] },
  labelEditable: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    borderRadius: vars["--aui-radius-mark"],
    cursor: "text",
    outline: "none",
  },


  /* ------------------------------------------------------------ sortable row */
  sortableRow: { position: "relative" },
  sortableRowDragging: { opacity: 0.5 },

  /* ------------------------------------------------------ workspace row actions */
  rowActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    position: "absolute",
  },
  rowActionsInline: {
    insetBlockEnd: 0,
    insetBlockStart: 0,
    insetInlineEnd: 0,
    paddingInlineEnd: vars["--aui-space-4"],
  },
  rowActionsPinned: { opacity: 1, pointerEvents: "auto" },
  rowActionsReveal: {
    opacity: `var(${ROW_ACTION_OPACITY}, 0)`,
    pointerEvents: `var(${ROW_ACTION_EVENTS}, none)`,
  },
  rowCountHidden: { opacity: 0 },
  rowCountYields: { opacity: `var(${ROW_COUNT_OPACITY}, 1)` },
  /** Holds the revealed actions' room at the end of a work-queue row. */
  rowActionReserve: { flexShrink: 0, width: `var(${ROW_ACTION_RESERVE}, 0px)` },
  rowActionsTrigger: {
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text-muted"],
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
    color: vars["--aui-color-text"],
    zIndex: 0,
  },
  chrome: {
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
  },
  chromeCollapsed: {
    borderBottomColor: vars["--aui-color-border-subtle"],
    paddingBottom: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-8"],
  },
  chromeExpanded: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border"],
    display: "flex",
    flexShrink: 0,
    height: 48,
    paddingInline: vars["--aui-space-12"],
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
    gap: vars["--aui-space-8"],
  },
  chromeTrailing: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "flex-end",
    width: "100%",
  },
  collapsedPrimaryButton: {
    backgroundColor: {
      default: vars["--aui-color-overlay-hover"],
      ":hover": vars["--aui-color-selection-fill"],
    },
    borderRadius: vars["--aui-radius-control"],
    height: 40,
    padding: 0,
    width: 40,
  },
  collapsedButton: {
    borderRadius: vars["--aui-radius-control"],
    height: 40,
    padding: 0,
    width: 40,
  },
  collapsedButtonActive: {
    backgroundColor: vars["--aui-color-selection-fill"],
    color: vars["--aui-color-text"],
  },
  collapsedButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
  },
  chromeButton: {
    borderRadius: vars["--aui-radius-control"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    height: 32,
    padding: 0,
    width: 32,
  },
  // The collapse toggle sits pressed while the project list is open: a soft
  // accent wash and an accent glyph, the same look as a pressed right-rail
  // toggle.
  chromeButtonPressed: {
    backgroundColor: { default: accent16, ":hover": accent20 },
    color: vars["--aui-color-accent"],
  },
  chromeButtonSidebar: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    borderRadius: vars["--aui-radius-control"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
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
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  scrollAreaExpanded: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlockEnd: vars["--aui-space-8"],
    paddingBlockStart: 6,
    paddingInline: vars["--aui-space-8"],
  },
  collapsedEntry: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  collapsedGroupRule: {
    backgroundColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-full"],
    height: 1,
    marginBlockEnd: vars["--aui-space-8"],
    width: 20,
  },
  collapsedWorkspaceButton: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  collapsedWorkspaceActive: {
    backgroundColor: accent10,
    borderColor: accent40,
    color: vars["--aui-color-accent"],
  },
  // See `workspaceRowLastOpened`: a neutral hairline instead of the accent fill.
  collapsedWorkspaceLastOpened: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderColor: vars["--aui-color-border"],
    color: vars["--aui-color-text"],
  },
  collapsedWorkspaceIdle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderColor: { default: "transparent", ":hover": vars["--aui-color-border"] },
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },

  navStack: { display: "flex", flexDirection: "column", gap: 2 },
  navStackSpaced: { marginBlockEnd: vars["--aui-space-8"] },
  // The 12px gap puts the label on the same edge as the search text below.
  navButton: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-12"],
    height: 32,
    paddingInline: vars["--aui-space-8"],
    width: "100%",
  },
  navButtonActive: {
    backgroundColor: vars["--aui-color-selection-fill"],
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  navButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },

  viewBar: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    justifyContent: "space-between",
    marginBlockEnd: 6,
    paddingInline: vars["--aui-space-8"],
  },
  viewToggle: {
    alignItems: "center",
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: 2,
    padding: 2,
  },
  // Concentric with `viewToggle`: its radius minus the 2px padding and border.
  viewToggleButton: {
    borderRadius: `calc(${vars["--aui-radius-control"]} - 2px - ${vars["--aui-border-width-hairline"]})`,
    height: 24,
    padding: 0,
    width: 28,
  },
  viewToggleButtonActive: {
    backgroundColor: vars["--aui-color-selection-fill"],
    color: vars["--aui-color-text"],
  },
  viewToggleButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  viewBarActions: { alignItems: "center", display: "flex", gap: vars["--aui-space-4"] },
  displayModeMenu: { width: 176 },

  searchRow: {
    marginBlockEnd: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
    position: "relative",
  },
  searchIcon: {
    color: vars["--aui-color-text-subtle"],
    height: 14,
    insetBlockStart: "50%",
    insetInlineStart: vars["--aui-space-16"],
    pointerEvents: "none",
    position: "absolute",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    backgroundColor: "transparent",
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    fontSize: vars["--aui-font-size-body"],
    height: vars["--aui-control-height-sm"],
    paddingInlineEnd: 28,
    paddingInlineStart: 28,
  },
  searchClear: {
    borderRadius: vars["--aui-radius-control"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    height: 24,
    insetBlockStart: "50%",
    insetInlineEnd: vars["--aui-space-12"],
    padding: 0,
    position: "absolute",
    transform: "translateY(-50%)",
    width: 24,
  },

  repositoryStack: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  repositorySectionDragging: {
    backgroundColor: vars["--aui-color-selection-fill"],
    borderRadius: vars["--aui-radius-control"],
  },
  repositoryHeaderRow: { alignItems: "center", display: "flex", gap: vars["--aui-space-4"] },

  repositoryRow: {
    [REPOSITORY_ROW_OPEN]: { default: "0", ":hover": "1", ":focus-within": "1" },
    [REPOSITORY_MARK_SCALE]: {
      default: "1",
      ":hover": "0.75",
      ":focus-within": "0.75",
    },
    [REPOSITORY_MARK_OPACITY]: {
      default: "1",
      ":hover": "0",
      ":focus-within": "0",
    },
    [REPOSITORY_CHEVRON_SCALE]: {
      default: "0.75",
      ":hover": "1",
      ":focus-within": "1",
    },
    [REPOSITORY_CHEVRON_OPACITY]: {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
    [REPOSITORY_COUNT_OPACITY]: {
      default: "1",
      ":hover": "0",
      ":focus-within": "0",
    },
    [REPOSITORY_COUNT_SHIFT]: {
      default: "0px",
      ":hover": "0.25rem",
      ":focus-within": "0.25rem",
    },
    [REPOSITORY_COUNT_EVENTS]: {
      default: "auto",
      ":hover": "none",
      ":focus-within": "none",
    },
    [REPOSITORY_ACTIONS_OPACITY]: {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
    [REPOSITORY_ACTIONS_SHIFT]: {
      default: "0.25rem",
      ":hover": "0px",
      ":focus-within": "0px",
    },
    [REPOSITORY_ACTIONS_EVENTS]: {
      default: "none",
      ":hover": "auto",
      ":focus-within": "auto",
    },
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":focus-within": vars["--aui-color-overlay-hover"],
    },
    borderRadius: vars["--aui-radius-control"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    display: "flex",
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
    textAlign: "left",
  },
  repositoryRowDraggable: {
    cursor: { default: "pointer", ":active": "grabbing" },
  },
  repositoryRowDragging: { cursor: "grabbing" },
  repositoryToggle: {
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 32,
    padding: 0,
    position: "relative",
    width: 32,
  },
  repositoryMark: {
    height: 28,
    opacity: `var(${REPOSITORY_MARK_OPACITY}, 1)`,
    transform: `scale(var(${REPOSITORY_MARK_SCALE}, 1))`,
    ...revealMotion,
    transitionProperty: "opacity, transform",
    width: 28,
  },
  repositoryMarkIcon: { height: 14, width: 14 },
  repositoryChevronSlot: {
    alignItems: "center",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
  },
  repositoryChevron: {
    height: 16,
    opacity: `var(${REPOSITORY_CHEVRON_OPACITY}, 0)`,
    // Same swap-vs-rotate story as `laneChevron`, except here the popped node
    // ALSO threw away the hover-reveal scale mid-flight: the replacement
    // mounted at its resting `0.75` and re-ran the reveal from scratch.
    transform: `rotate(0deg) scale(var(${REPOSITORY_CHEVRON_SCALE}, 0.75))`,
    ...revealMotion,
    transitionProperty: "opacity, transform",
    width: 16,
  },
  repositoryChevronOpen: {
    transform: `rotate(90deg) scale(var(${REPOSITORY_CHEVRON_SCALE}, 0.75))`,
  },
  repositoryLead: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--aui-space-8"],
    minWidth: 0,
    position: "relative",
    // The room it opens for the hover actions arrives in one step: padding
    // is layout, and animating it re-wrapped the project name every frame.
  },
  /* Hover reserves room for the absolutely positioned row actions; a pinned
     attention alert needs its own slot beyond them. */
  repositoryLeadPinned: {
    paddingInlineEnd: `calc(var(${REPOSITORY_ROW_OPEN}, 0) * 7.75rem)`,
  },
  repositoryLeadDefault: {
    paddingInlineEnd: `calc(var(${REPOSITORY_ROW_OPEN}, 0) * 5.75rem)`,
  },
  repositoryName: {
    flex: 1,
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  repositoryCountSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    marginInlineStart: "auto",
    ...revealMotion,
    transitionProperty: "opacity, transform",
  },
  repositoryCountSlotYields: {
    opacity: `var(${REPOSITORY_COUNT_OPACITY}, 1)`,
    pointerEvents: `var(${REPOSITORY_COUNT_EVENTS}, auto)`,
    transform: `translateX(var(${REPOSITORY_COUNT_SHIFT}, 0px))`,
  },
  // A figure in a fixed, end-aligned slot rather than a boxed pill: the
  // count is secondary text, and one width keeps every name's edge still.
  repositoryCount: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
    height: 20,
    justifyContent: "flex-end",
    minWidth: 24,
    paddingInlineEnd: vars["--aui-space-4"],
  },
  repositoryActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 2,
    insetBlockStart: "50%",
    insetInlineEnd: 0,
    opacity: `var(${REPOSITORY_ACTIONS_OPACITY}, 0)`,
    pointerEvents: `var(${REPOSITORY_ACTIONS_EVENTS}, none)`,
    position: "absolute",
    transform: `translateY(-50%) translateX(var(${REPOSITORY_ACTIONS_SHIFT}, 0.25rem))`,
    ...revealMotion,
    transitionProperty: "opacity, transform",
  },
  repositoryActionButton: {
    borderRadius: vars["--aui-radius-control"],
    height: 28,
    padding: 0,
    width: 28,
  },
  repositoryDragPreviewMark: {
    borderRadius: vars["--aui-radius-control"],
    height: 20,
    width: 20,
  },
  repositoryDragPreviewIcon: { height: 12, width: 12 },

  workspaceList: { paddingBlockEnd: vars["--aui-space-4"], paddingBlockStart: 2 },
  workspaceListInner: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  workspaceItem: {
    borderRadius: vars["--aui-radius-control"],
    minWidth: 0,
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionProperty: "background-color",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },

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
      [ROW_ACTIONS_PINNED]: "0",
    },
    [ROW_ACTION_RESERVE]: {
      default: "0px",
      ":hover": ROW_ACTION_BOX,
      ":has(:focus-visible)": ROW_ACTION_BOX,
      [ROW_ACTIONS_PINNED]: ROW_ACTION_BOX,
    },
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    position: "relative",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionProperty: "background-color, border-color, box-shadow, color",
    // Was absent, so the row's fill/border/shadow ran on the UA `ease` while
    // every control inside it runs on the house curve.
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  // The fill alone marks the selected workspace: no outline, raised shadow or
  // corner mark, so selection reads calmly next to the idle rows. The row's
  // tone sits over the group's (`workspaceGroupActive`).
  workspaceRowActive: {
    backgroundColor: { default: accent10, ":hover": accent14 },
    borderColor: "transparent",
    color: vars["--aui-color-text"],
  },
  // The active workspace while a global view (Fleet, Agents…) owns the main
  // column: the last place opened, not where the user is. No fill — the view's
  // nav row is the one selected item — only the full ink and the label's
  // weight (`labelActive`) mark it among the muted idle rows.
  workspaceRowLastOpened: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderColor: "transparent",
    color: vars["--aui-color-text"],
  },
  // Hover is the neutral wash, never an accent fill: only the active row is
  // filled, so it stays the one row that reads as selected.
  workspaceRowIdle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderColor: "transparent",
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  workspaceRowDragging: {
    backgroundColor: vars["--aui-color-selection-fill"],
    borderColor: vars["--aui-color-border-subtle"],
    boxShadow: vars["--aui-elevation-raised"],
  },
  workspaceOpen: {
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    minWidth: 0,
    textAlign: "left",
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
  /**
   * The row's last in-flow box, under the revealed actions: it widens to their
   * room on reveal, so the title truncates before the menu instead of under it.
   * A count already that wide does not move.
   */
  workspaceCountHost: {
    flexShrink: 0,
    minWidth: `var(${ROW_ACTION_RESERVE}, 0px)`,
    position: "relative",
  },

  footer: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
  },
  footerCollapsed: { paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-8"] },
  footerExpanded: { paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"] },
  footerRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
  },
  footerGroup: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"] },

  archiveOption: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    cursor: "pointer",
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  archiveCheckbox: { accentColor: vars["--aui-color-danger"] },
  archiveLabelOn: { color: vars["--aui-color-danger-text"] },
  archiveLabelOff: { color: vars["--aui-color-text-muted"] },
});
