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
  // One 24px row under a hairline: the row is content-box so its 24px
  // segments fill it exactly and the rule sits outside them. The bar is the
  // container its right-hand segments measure (`status-bar-shrink.ts`).
  statusBar: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    boxSizing: "content-box",
    containerName: "statusBar",
    containerType: "inline-size",
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    height: 24,
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-4"],
  },
  // The right-hand group keeps its width; the usage strip gives way first.
  statusGroup: { alignItems: "center", display: "flex", flexShrink: 0, gap: 2 },
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
  repositoryIdentityMark: {
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
  repositoryIcon: { height: 14, width: 14 },
  repositoryColorSwatch: {
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
  windowControls: { alignItems: "center", display: "flex", flexShrink: 0, gap: vars["--ads-space-4"] },
  // The top bar's group rule: between its action groups and before the
  // window controls.
  windowDivider: { backgroundColor: vars["--ads-color-border"], flexShrink: 0, height: 16, marginInline: vars["--ads-space-4"], width: 1 },
  // The top bar's one 32px rung, like every other control in it.
  windowButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderRadius: vars["--ads-radius-control"],
    height: 32,
    padding: 0,
    width: 32,
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
