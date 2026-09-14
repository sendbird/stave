import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Sidebar chrome. Colours come from ADS tokens; the alpha ramps that Tailwind
 * spelled as `bg-primary/12` are rebuilt with `color-mix` over a token so no
 * new colour is introduced.
 */
const accent10 = `color-mix(in srgb, ${vars["--ads-color-accent"]} 10%, transparent)`;
const accent12 = `color-mix(in srgb, ${vars["--ads-color-accent"]} 12%, transparent)`;
const accent16 = `color-mix(in srgb, ${vars["--ads-color-accent"]} 16%, transparent)`;
const accent40 = `color-mix(in srgb, ${vars["--ads-color-accent"]} 40%, transparent)`;
const accent45 = `color-mix(in srgb, ${vars["--ads-color-accent"]} 45%, transparent)`;

/**
 * The sidebar's hover-reveal beat: the project mark trading places with its
 * chevron, the row actions sliding in, the count yielding to them, and the
 * lead's padding opening to make room. All five were authored as a bare
 * `transitionDuration` literal with NO timing function, which means they ran on
 * the UA's `ease` rather than the house curve — the sidebar was the one surface
 * in the app whose hovers accelerated differently from every button beside it —
 * and with no `prefers-reduced-motion` arm at all, so the transform halves kept
 * playing for a reader who had asked them not to. One tokenized object, spread
 * into each of the five, so they cannot drift again.
 *
 * `motionDurationNormal` (180ms) is the token nearest the hand-picked value;
 * the spatial arm collapses to `0ms` under Reduce Motion exactly as
 * `recipes/transition`'s own `transform` key does.
 */
const revealMotion = {
  transitionDuration: {
    default: vars["--ads-motion-duration-normal"],
    "@media (prefers-reduced-motion: reduce)": "0ms",
  },
  transitionTimingFunction: vars["--ads-motion-ease-standard"],
} as const;

/** Tooltip surfaces paint on `colorText`, so their "background" tints mix toward it. */
const invertedText70 = `color-mix(in oklab, ${vars["--ads-color-text-inverted"]} 70%, ${vars["--ads-color-text"]})`;
const invertedFill10 = `color-mix(in oklab, ${vars["--ads-color-text-inverted"]} 10%, ${vars["--ads-color-text"]})`;
const invertedEdge20 = `color-mix(in oklab, ${vars["--ads-color-text-inverted"]} 20%, ${vars["--ads-color-text"]})`;

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
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    marginInlineStart: vars["--ads-space-4"],
    maxWidth: "5rem",
    overflow: "hidden",
    paddingBlock: 1,
    paddingInline: vars["--ads-space-4"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /* --------------------------------------------------- hover preview tooltip */
  previewContent: {
    maxWidth: 260,
    overflowWrap: "break-word",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  previewStack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  previewHeadStack: { display: "flex", flexDirection: "column", gap: 2 },
  previewBodyStack: { display: "flex", flexDirection: "column", gap: 6 },
  previewTaskStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  previewTitle: {
    color: vars["--ads-color-text-inverted"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  previewMeta: {
    color: invertedText70,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  previewMetaRow: {
    alignItems: "center",
    color: invertedText70,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: 6,
    lineHeight: vars["--ads-line-height-tight"],
  },
  previewRunningChip: {
    backgroundColor: invertedFill10,
    borderColor: invertedEdge20,
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-inverted"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: 2,
    paddingInline: vars["--ads-space-4"],
  },
  // The hover preview's row title, so it takes the row-title step; the 16px
  // literal leading was sized for Caption and clipped 14px descenders.
  previewTaskTitle: {
    color: vars["--ads-color-text-inverted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  previewShortcutChip: {
    height: 16,
    fontSize: vars["--ads-font-size-micro"],
    marginBlockStart: 2,
    paddingInline: vars["--ads-space-4"],
  },

  /* ------------------------------------------------------ status iconography */
  statusMuted: { color: vars["--ads-color-text-muted"] },
  statusIcon: { height: 16, width: 16 },
  statusIconWarning: { color: vars["--ads-color-warning"], height: 16, width: 16 },
  statusIconDanger: { color: vars["--ads-color-danger"], height: 16, width: 16 },
  statusIconGitOpen: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-open))`,
    height: 16,
    width: 16,
  },
  statusIconGitClosed: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-closed))`,
    height: 16,
    width: 16,
  },
  statusIconGitModified: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-modified))`,
    height: 16,
    width: 16,
  },
  identityMark: { borderRadius: vars["--ads-radius-mark"], height: 16, width: 16 },
  identityMarkIcon: { height: 10, width: 10 },
  toneAccent: { color: vars["--ads-color-accent"] },
  toneWarning: { color: vars["--ads-color-warning"] },
  toneClaude: { color: "var(--provider-claude)" },
  toneCodex: { color: "var(--provider-codex)" },

  /* -------------------------------------------------------- work-queue rows */
  queueRow: { minWidth: 0 },
  queueButton: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    height: 32,
    minWidth: 0,
    paddingInline: vars["--ads-space-8"],
    width: "100%",
  },
  queueButtonActive: { backgroundColor: accent12, color: vars["--ads-color-text"] },
  queueButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-selection-fill"] },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
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
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  laneStack: { display: "flex", flexDirection: "column", gap: 2 },
  // Both the lane's section header and its collapse target, so it is held to
  // the section-header step: Micro plus uppercase plus 0.18em tracking made a
  // full-width click target out of the rail's smallest, widest-set line. The
  // box is `controlHeightXs` by token so the density axis reaches it.
  laneButton: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-selection-fill"] },
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    gap: 6,
    height: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-8"],
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
    height: vars["--ads-control-icon-size-sm"],
    transform: "rotate(0deg)",
    width: vars["--ads-control-icon-size-sm"],
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
    backgroundColor: vars["--ads-color-text-subtle"],
    borderRadius: vars["--ads-radius-full"],
    height: 6,
    width: 6,
  },
  attentionIconWarning: { color: vars["--ads-color-warning"], height: 14, width: 14 },
  attentionIconDanger: { color: vars["--ads-color-danger"], height: 14, width: 14 },
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
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },

  /* ------------------------------------------------- responding count badge */
  respondingSlot: {
    alignItems: "center",
    display: "flex",
    height: 28,
    justifyContent: "center",
    minWidth: 28,
    paddingInlineEnd: vars["--ads-space-4"],
  },
  /*
   * Geometry only. These used to override `Badge`'s fill, ring and ink with a
   * hand-mixed accent wash, which broke twice over: the mix is TRANSLUCENT, so
   * the chip's real colour changed with whatever the row behind it was doing —
   * at rest, hovered or selected — where a semantic token is opaque precisely
   * so it does not; and it re-chromatised what the theme layer deliberately
   * de-chromatises, since `ads-theme.ts` remaps `colorAccentSoft` to a neutral
   * wash because spreading the host's accent across ordinary rows and chips
   * was what made every theme look blue. The colour now comes from
   * `Badge tone="accent"`, so it is one decision made in one place.
   */
  respondingBadge: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    justifyContent: "center",
    minWidth: 28,
    paddingBlock: 2,
    paddingInline: 6,
  },
  respondingBadgeInline: {
    borderRadius: vars["--ads-radius-mark"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    height: 16,
    justifyContent: "center",
    minWidth: 20,
    paddingInline: vars["--ads-space-4"],
  },

  /* --------------------------------------------------- inline workspace label */
  labelInput: {
    backgroundColor: vars["--ads-color-canvas"],
    fontSize: vars["--ads-font-size-body"],
    height: 28,
    minWidth: 0,
    paddingInline: vars["--ads-space-8"],
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
  labelRoomy: { paddingInlineEnd: vars["--ads-space-32"] },
  labelActive: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  labelEditable: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    borderRadius: vars["--ads-radius-mark"],
    cursor: "text",
    outline: "none",
  },

  /* ------------------------------------------------------ expanded row meta */
  metaGrid: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "grid",
    fontSize: vars["--ads-font-size-caption"],
    gridColumn: "span 2",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    lineHeight: vars["--ads-line-height-tight"],
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
    color: vars["--ads-color-text-subtle"],
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
    fontSize: vars["--ads-font-size-micro"],
    height: 16,
    paddingInline: vars["--ads-space-4"],
  },

  /* ------------------------------------------------------------ sortable row */
  sortableRow: { position: "relative" },
  sortableRowDragging: { opacity: 0.5 },

  /* ------------------------------------------------------ workspace row actions */
  rowActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    position: "absolute",
  },
  rowActionsTop: { insetBlockStart: 6, insetInlineEnd: vars["--ads-space-4"] },
  rowActionsInline: {
    insetBlockEnd: 0,
    insetBlockStart: 0,
    insetInlineEnd: 0,
    paddingInlineEnd: vars["--ads-space-4"],
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
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
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
    color: vars["--ads-color-text"],
    zIndex: 0,
  },
  /*
   * The collapse/expand glide. `width`/`min-width` stay in the inline `style`
   * because they are a live pixel value the user drags; only the transition
   * moves here, and it moves for two reasons the inline attribute cannot serve:
   * the hard-coded `200ms ease` was the last un-tokenized curve in the sidebar,
   * and an inline declaration cannot carry a `prefers-reduced-motion` arm — so
   * the whole rail kept sliding for a reader who had opted out of exactly that.
   * `motionDurationNormal` is the token nearest the hand-picked value.
   */
  asideAnimated: {
    transitionDuration: {
      default: vars["--ads-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width, min-width",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  chrome: {
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
  },
  chromeCollapsed: {
    borderBottomColor: vars["--ads-color-border-subtle"],
    paddingBottom: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-8"],
  },
  chromeExpanded: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    display: "flex",
    flexShrink: 0,
    height: 48,
    paddingInline: vars["--ads-space-12"],
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
    gap: vars["--ads-space-8"],
  },
  chromeTrailing: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    width: "100%",
  },
  collapsedPrimaryButton: {
    backgroundColor: {
      default: vars["--ads-color-overlay-hover"],
      ":hover": vars["--ads-color-selection-fill"],
    },
    borderRadius: vars["--ads-radius-control"],
    height: 40,
    padding: 0,
    width: 40,
  },
  collapsedButton: {
    borderRadius: vars["--ads-radius-control"],
    height: 40,
    padding: 0,
    width: 40,
  },
  collapsedButtonActive: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-text"],
  },
  collapsedButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-selection-fill"] },
  },
  chromeButton: {
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    height: 32,
    padding: 0,
    width: 32,
  },
  chromeButtonSidebar: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-selection-fill"] },
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
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
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  scrollAreaExpanded: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlockEnd: vars["--ads-space-8"],
    paddingBlockStart: 6,
    paddingInline: vars["--ads-space-8"],
  },
  collapsedEntry: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  collapsedGroupRule: {
    backgroundColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-full"],
    height: 1,
    marginBlockEnd: vars["--ads-space-8"],
    width: 20,
  },
  collapsedWorkspaceButton: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  collapsedWorkspaceActive: {
    backgroundColor: accent10,
    borderColor: accent40,
    color: vars["--ads-color-accent"],
  },
  collapsedWorkspaceIdle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-selection-fill"],
    },
    borderColor: { default: "transparent", ":hover": vars["--ads-color-border"] },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },

  navStack: { display: "flex", flexDirection: "column", gap: 2 },
  navStackSpaced: { marginBlockEnd: vars["--ads-space-8"] },
  navButton: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    height: 32,
    paddingInline: vars["--ads-space-8"],
    width: "100%",
  },
  navButtonActive: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  navButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-selection-fill"] },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },

  viewBar: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    justifyContent: "space-between",
    marginBlockEnd: 6,
    paddingInline: vars["--ads-space-8"],
  },
  viewToggle: {
    alignItems: "center",
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: 2,
    padding: 2,
  },
  viewToggleButton: { borderRadius: 5, height: 24, padding: 0, width: 28 },
  viewToggleButtonActive: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-text"],
  },
  viewToggleButtonIdle: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  viewBarActions: { alignItems: "center", display: "flex", gap: vars["--ads-space-4"] },
  displayModeMenu: { width: 176 },

  searchRow: {
    marginBlockEnd: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
    position: "relative",
  },
  searchIcon: {
    color: vars["--ads-color-text-subtle"],
    height: 14,
    insetBlockStart: "50%",
    insetInlineStart: vars["--ads-space-16"],
    pointerEvents: "none",
    position: "absolute",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    backgroundColor: "transparent",
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    fontSize: vars["--ads-font-size-body"],
    height: vars["--ads-control-height-sm"],
    paddingInlineEnd: 28,
    paddingInlineStart: 28,
  },
  searchClear: {
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    height: 24,
    insetBlockStart: "50%",
    insetInlineEnd: vars["--ads-space-12"],
    padding: 0,
    position: "absolute",
    transform: "translateY(-50%)",
    width: 24,
  },

  emptyState: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-12"],
  },

  projectStack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  projectSectionDragging: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderRadius: vars["--ads-radius-control"],
  },
  projectHeaderRow: { alignItems: "center", display: "flex", gap: vars["--ads-space-4"] },

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
      default: "transparent",
      ":hover": vars["--ads-color-selection-fill"],
      ":focus-within": vars["--ads-color-selection-fill"],
    },
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
    textAlign: "left",
  },
  projectRowDraggable: {
    cursor: { default: "pointer", ":active": "grabbing" },
  },
  projectRowDragging: { cursor: "grabbing" },
  projectToggle: {
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
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
    ...revealMotion,
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
    // Same swap-vs-rotate story as `laneChevron`, except here the popped node
    // ALSO threw away the hover-reveal scale mid-flight: the replacement
    // mounted at its resting `0.75` and re-ran the reveal from scratch.
    transform: `rotate(0deg) scale(var(${PROJECT_CHEVRON_SCALE}, 0.75))`,
    ...revealMotion,
    transitionProperty: "opacity, transform",
    width: 16,
  },
  projectChevronOpen: {
    transform: `rotate(90deg) scale(var(${PROJECT_CHEVRON_SCALE}, 0.75))`,
  },
  projectLead: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--ads-space-8"],
    minWidth: 0,
    position: "relative",
    ...revealMotion,
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
    fontWeight: vars["--ads-font-weight-medium"],
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
    ...revealMotion,
    transitionProperty: "opacity, transform",
  },
  projectCountSlotYields: {
    opacity: `var(${PROJECT_COUNT_OPACITY}, 1)`,
    pointerEvents: `var(${PROJECT_COUNT_EVENTS}, auto)`,
    transform: `translateX(var(${PROJECT_COUNT_SHIFT}, 0px))`,
  },
  projectCount: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-overlay-hover"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
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
    ...revealMotion,
    transitionProperty: "opacity, transform",
  },
  projectActionButton: {
    borderRadius: vars["--ads-radius-control"],
    height: 28,
    padding: 0,
    width: 28,
  },
  projectDragPreviewMark: {
    borderRadius: vars["--ads-radius-control"],
    height: 20,
    width: 20,
  },
  projectDragPreviewIcon: { height: 12, width: 12 },

  workspaceList: { paddingBlockEnd: vars["--ads-space-4"], paddingBlockStart: 2 },
  workspaceListInner: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
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
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    position: "relative",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionProperty: "background-color, border-color, box-shadow, color",
    // Was absent, so the row's fill/border/shadow ran on the UA `ease` while
    // every control inside it runs on the house curve.
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  workspaceRowExpanded: { alignItems: "stretch", gap: vars["--ads-space-4"] },
  workspaceRowCompact: { alignItems: "center", gap: vars["--ads-space-4"] },
  workspaceRowActive: {
    backgroundColor: { default: accent12, ":hover": accent16 },
    borderColor: accent45,
    boxShadow: vars["--ads-elevation-raised"],
    color: vars["--ads-color-text"],
    "::before": {
      borderLeftColor: vars["--ads-color-accent"],
      borderLeftStyle: "solid",
      borderLeftWidth: 2,
      borderTopColor: vars["--ads-color-accent"],
      borderTopLeftRadius: vars["--ads-radius-mark"],
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
      ":hover": vars["--ads-color-selection-fill"],
    },
    borderColor: { default: "transparent", ":hover": vars["--ads-color-border-subtle"] },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  workspaceRowDragging: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderColor: vars["--ads-color-border-subtle"],
    boxShadow: vars["--ads-elevation-raised"],
  },
  workspaceOpen: {
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    minWidth: 0,
    textAlign: "left",
  },
  workspaceOpenExpanded: {
    alignItems: "start",
    columnGap: vars["--ads-space-8"],
    display: "grid",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
  },
  workspaceOpenCompact: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
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
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
  },
  footerCollapsed: { paddingBlock: vars["--ads-space-8"], paddingInline: vars["--ads-space-8"] },
  footerExpanded: { paddingBlock: vars["--ads-space-8"], paddingInline: vars["--ads-space-12"] },
  footerRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },
  footerGroup: { alignItems: "center", display: "flex", gap: vars["--ads-space-8"] },

  archiveOption: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    cursor: "pointer",
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  archiveCheckbox: { accentColor: vars["--ads-color-danger"] },
  archiveLabelOn: { color: vars["--ads-color-danger-text"] },
  archiveLabelOff: { color: vars["--ads-color-text-muted"] },
});
