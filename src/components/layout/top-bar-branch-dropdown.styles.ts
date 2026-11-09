import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

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
    backgroundColor: vars["--aui-color-overlay-pressed"],
    borderColor: vars["--aui-color-accent"],
    color: vars["--aui-color-text"],
  },
  triggerDrift: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    color: vars["--aui-color-warning-text"],
  },
  dirtyCount: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-full"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    justifyContent: "center",
    lineHeight: "1rem",
    minWidth: 16,
    paddingInline: vars["--aui-space-4"],
  },
  dirtyCountConflict: {
    backgroundColor: vars["--aui-color-danger-soft"],
    color: vars["--aui-color-danger-text"],
  },
  dirtyCountDirty: {
    backgroundColor: vars["--aui-color-warning-soft"],
    color: vars["--aui-color-warning-text"],
  },
  // The chevron is a child of the trigger button, not a sibling control, so it
  // inherits the control's centring and sits on the `sm` glyph rung.
  chevron: {
    blockSize: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
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
    backgroundColor: vars["--aui-color-canvas"],
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-8"],
  },
  headerRow: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"] },
  searchField: { flex: 1, minWidth: 0, position: "relative" },
  searchIcon: {
    color: vars["--aui-color-text-muted"],
    height: 14,
    insetInlineStart: "0.625rem",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 14,
  },
  searchInput: {
    borderRadius: vars["--aui-radius-control"],
    fontSize: vars["--aui-font-size-body"],
    paddingInlineStart: vars["--aui-space-32"],
  },
  spinning: {
    animationDuration: {
      default: vars["--aui-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },

  // --- Drift banner -------------------------------------------------------
  driftNote: {
    alignItems: "flex-start",
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    marginTop: vars["--aui-space-8"],
    padding: "0.625rem",
  },
  driftIcon: {
    color: vars["--aui-color-warning-text"],
    flexShrink: 0,
    height: 16,
    marginTop: vars["--aui-space-2"],
    width: 16,
  },
  driftBody: { flex: 1, minWidth: 0 },
  driftTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  driftText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    marginTop: vars["--aui-space-2"],
  },
  driftAction: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    height: 28,
    paddingInline: vars["--aui-space-8"],
  },

  // --- Current-branch section --------------------------------------------
  // Flat inside the popup: the popup surface is already the card, so a bordered
  // box here would be a card-inside-a-card. Sections separate by a hairline
  // rule and spacing instead of a nested bordered box.
  statusSection: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    marginTop: vars["--aui-space-8"],
    paddingTop: vars["--aui-space-8"],
  },
  statusRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  statusBranch: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusBadge: { flexShrink: 0 },
  statusHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    marginTop: vars["--aui-space-4"],
  },
  // Fetch / Pull share a rung; the detached-checkout action wraps to a full
  // row beneath them. Every control sits on the `sm` (32px) rung.
  actionRow: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    marginTop: vars["--aui-space-8"],
  },
  actionButton: {
    gap: 6,
    justifyContent: "center",
    paddingInline: vars["--aui-space-8"],
    width: "100%",
  },
  detachSlot: { display: "flex", gridColumn: "1 / -1" },
  detachButton: {
    gap: 6,
    justifyContent: "center",
    paddingInline: vars["--aui-space-8"],
    width: "100%",
  },

  // --- Create branch ------------------------------------------------------
  createRow: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    marginTop: vars["--aui-space-8"],
    paddingTop: vars["--aui-space-8"],
  },
  createInput: {
    borderRadius: vars["--aui-radius-control"],
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    minWidth: 0,
  },
  createButton: {
    flexShrink: 0,
    gap: 6,
    paddingInline: vars["--aui-space-12"],
  },
  createError: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: 6,
    paddingInline: vars["--aui-space-2"],
  },
  branchError: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-8"],
    overflowWrap: "break-word",
    paddingBlock: 6,
    paddingInline: vars["--aui-space-8"],
    whiteSpace: "pre-wrap",
  },

  // --- Branch list --------------------------------------------------------
  list: { flex: 1, minHeight: 0, overflowY: "auto", padding: vars["--aui-space-8"] },
  groups: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  groupHeader: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    justifyContent: "space-between",
    letterSpacing: "normal",
    marginBottom: vars["--aui-space-4"],
    paddingInline: 6,
    textTransform: "uppercase",
  },
  groupOptions: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"] },
  option: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
    textAlign: "left",
    width: "100%",
  },
  optionCurrent: {
    backgroundColor: vars["--aui-color-selection-fill"],
    borderColor: vars["--aui-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  optionSelectable: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
  },
  optionDisabled: { cursor: "not-allowed", opacity: vars["--aui-opacity-disabled"] },
  optionIcon: { color: vars["--aui-color-text-muted"] },
  optionText: { flex: 1, minWidth: 0 },
  optionName: {
    color: vars["--aui-color-text"],
    display: "block",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionDescription: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionCheck: { color: vars["--aui-color-success"] },
  emptyState: {
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-24"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "center",
  },

  // --- Read-only chip (worktree-managed branch) ---------------------------
  staticChip: { maxWidth: 224 },
});
