import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const layoutShellStyles = stylex.create({
  editorPanel: { height: "100%", minWidth: 0, overflow: "hidden", width: "100%" },
  editorPanelBody: {
    backgroundColor: vars["--ads-color-surface"],
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  statusBar: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    height: 28,
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-4"],
  },
  statusGroup: { alignItems: "center", display: "flex", gap: 2 },
  shortcut: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    gap: 2,
    height: 20,
    minWidth: 0,
    paddingInline: vars["--ads-space-8"],
  },
  shortcutSeparator: { color: vars["--ads-color-text-muted"] },
  identityMark: {
    alignItems: "center",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  workspaceIcon: { height: 12, width: 12 },
  projectIdentityMark: {
    alignItems: "center",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  projectIcon: { height: 14, width: 14 },
  projectColorSwatch: {
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 9999,
    display: "inline-flex",
    height: 20,
    width: 20,
  },
  diffReview: { paddingBlock: vars["--ads-space-4"], width: "100%" },
  topBarButton: {
    // States are declared as conditions ON each property, not as a top-level
    // `":hover": { ... }` block. The nested form compiles to a `:hover`-
    // qualified rule that outranks any plain declaration from a later style,
    // so `topBarButtonActive`'s flat `backgroundColor` lost to it and an
    // active button was indistinguishable from a hovered one.
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    flexShrink: 0,
    height: 32,
    padding: 0,
    position: "relative",
    width: 32,
  },
  // Restates the same properties at the same condition depth, so composing it
  // after `topBarButton` wins at rest AND under the cursor. The active fill is
  // the heavier pressed wash so "selected" still reads while hovered.
  topBarButtonActive: {
    backgroundColor: {
      default: vars["--ads-color-overlay-pressed"],
      ":hover": vars["--ads-color-overlay-pressed"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    color: { default: vars["--ads-color-text"], ":hover": vars["--ads-color-text"] },
  },
  topBarButtonWarning: { color: vars["--ads-color-warning-text"] },
  inlineFlex: { display: "inline-flex" },
  icon16: { height: 16, width: 16 },
  windowControls: { alignItems: "center", display: "flex", flexShrink: 0, gap: 6 },
  windowDivider: { backgroundColor: vars["--ads-color-border"], height: 16, marginInline: vars["--ads-space-4"], width: 1 },
  windowButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderRadius: vars["--ads-radius-control"],
    height: 36,
    padding: 0,
    width: 36,
  },
  closeWindowButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-danger"],
      ":active": vars["--ads-color-danger"],
    },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text-inverted"] },
  },
  icon14: { height: 14, width: 14 },
  subdued: { opacity: 0.8 },
});
