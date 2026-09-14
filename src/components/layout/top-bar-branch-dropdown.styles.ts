import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const branchDropdownStyles = stylex.create({
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  flexNone: { flexShrink: 0 },

  // --- Trigger ------------------------------------------------------------
  // Geometry, type, and chrome fill come from `topBarControlStyles` so the
  // branch switcher lands on the same 32px baseline as the path chip and
  // "Commit graph" beside it. Only the truncation budget is local.
  trigger: { maxWidth: 224 },
  triggerOpen: {
    backgroundColor: vars["--ads-color-overlay-pressed"],
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-text"],
  },
  triggerDrift: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    color: vars["--ads-color-warning-text"],
  },
  dirtyCount: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-full"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    justifyContent: "center",
    lineHeight: "1rem",
    minWidth: 16,
    paddingInline: vars["--ads-space-4"],
  },
  dirtyCountConflict: {
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-danger-text"],
  },
  dirtyCountDirty: {
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
  },
  // The chevron is a child of the trigger button, not a sibling control, so it
  // inherits the control's centring and sits on the `sm` glyph rung.
  chevron: {
    blockSize: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
    transitionProperty: "transform",
  },
  chevronOpen: { transform: "rotate(180deg)" },

  // --- Menu shell ---------------------------------------------------------
  menu: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "min(34rem, calc(100vh - 5rem))",
    overflow: "hidden",
    padding: 0,
    width: "min(30rem, calc(100vw - 2rem))",
  },
  header: {
    backgroundColor: vars["--ads-color-canvas"],
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-8"],
  },
  headerRow: { alignItems: "center", display: "flex", gap: vars["--ads-space-8"] },
  searchField: { flex: 1, minWidth: 0, position: "relative" },
  searchIcon: {
    color: vars["--ads-color-text-muted"],
    height: 14,
    insetInlineStart: "0.625rem",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    borderRadius: vars["--ads-radius-control"],
    fontSize: vars["--ads-font-size-body"],
    paddingInlineStart: vars["--ads-space-32"],
  },
  spinning: {
    animationDuration: {
      default: vars["--ads-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },

  // --- Drift banner -------------------------------------------------------
  driftNote: {
    alignItems: "flex-start",
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-8"],
    padding: "0.625rem",
  },
  driftIcon: {
    color: vars["--ads-color-warning-text"],
    flexShrink: 0,
    height: 16,
    marginTop: vars["--ads-space-2"],
    width: 16,
  },
  driftBody: { flex: 1, minWidth: 0 },
  driftTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  driftText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
    marginTop: vars["--ads-space-2"],
  },
  driftAction: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    height: 28,
    paddingInline: vars["--ads-space-8"],
  },

  // --- Current-branch section --------------------------------------------
  // Flat inside the popup: the popup surface is already the card, so a bordered
  // box here would be a card-inside-a-card. Sections separate by a hairline
  // rule and spacing instead of a nested bordered box.
  statusSection: {
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    marginTop: vars["--ads-space-8"],
    paddingTop: vars["--ads-space-8"],
  },
  statusRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  statusBranch: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusBadge: { flexShrink: 0 },
  statusHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
    marginTop: vars["--ads-space-4"],
  },
  // Fetch / Pull share a rung; the detached-checkout action wraps to a full
  // row beneath them. Every control sits on the `sm` (32px) rung.
  actionRow: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    marginTop: vars["--ads-space-8"],
  },
  actionButton: {
    gap: 6,
    justifyContent: "center",
    paddingInline: vars["--ads-space-8"],
    width: "100%",
  },
  detachSlot: { display: "flex", gridColumn: "1 / -1" },
  detachButton: {
    gap: 6,
    justifyContent: "center",
    paddingInline: vars["--ads-space-8"],
    width: "100%",
  },

  // --- Create branch ------------------------------------------------------
  createRow: {
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-8"],
    paddingTop: vars["--ads-space-8"],
  },
  createInput: {
    borderRadius: vars["--ads-radius-control"],
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    minWidth: 0,
  },
  createButton: {
    flexShrink: 0,
    gap: 6,
    paddingInline: vars["--ads-space-12"],
  },
  createError: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-micro"],
    marginTop: 6,
    paddingInline: vars["--ads-space-2"],
  },
  branchError: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-8"],
    overflowWrap: "break-word",
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
    whiteSpace: "pre-wrap",
  },

  // --- Branch list --------------------------------------------------------
  list: { flex: 1, minHeight: 0, overflowY: "auto", padding: vars["--ads-space-8"] },
  groups: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  groupHeader: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    justifyContent: "space-between",
    letterSpacing: "normal",
    marginBottom: vars["--ads-space-4"],
    paddingInline: 6,
    textTransform: "uppercase",
  },
  groupOptions: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  option: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
    textAlign: "left",
    width: "100%",
  },
  optionCurrent: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  optionSelectable: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
  },
  optionDisabled: { cursor: "not-allowed", opacity: 0.7 },
  optionIcon: { color: vars["--ads-color-text-muted"] },
  optionText: { flex: 1, minWidth: 0 },
  optionName: {
    color: vars["--ads-color-text"],
    display: "block",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionDescription: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionCheck: { color: vars["--ads-color-success"] },
  emptyState: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "center",
  },

  // --- Read-only chip (worktree-managed branch) ---------------------------
  staticChip: { maxWidth: 224 },
});
