import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const conversationTurnActionsStyles = stylex.create({
  groupPreview: {
    display: "grid",
    gap: 6,
    gridTemplateColumns: "1fr 1fr",
    width: "100%",
  },
  groupInline: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-2"],
    marginLeft: "auto",
  },
  // Preview actions are full bordered cards on a translucent surface; the
  // inline variant is a compact text action with no border.
  actionPreview: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 55%, transparent)`,
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
    height: 32,
    justifyContent: "flex-start",
    paddingInline: vars["--aui-space-8"],
  },
  actionInline: {
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    height: 28,
    paddingInline: 6,
  },
  // Rollback carries the danger tone only in the roomy preview variant, where
  // its hover fill has room to read as a warning rather than as noise.
  rollbackPreview: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-danger-soft"],
    },
    color: {
      default: vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
  // A disabled action stays legible but inert: no hover recolor, no pointer.
  actionDisabled: {
    backgroundColor: {
      default: "transparent",
      ":hover": "transparent",
    },
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text-muted"],
    },
    cursor: "not-allowed",
    opacity: {
      default: 0.7,
      ":hover": 1,
      ":focus-visible": 1,
    },
  },
  dialogContent: {
    maxWidth: "24rem",
  },
  iconSm: {
    height: 14,
    width: 14,
  },
  iconMd: {
    height: 16,
    width: 16,
  },
});
