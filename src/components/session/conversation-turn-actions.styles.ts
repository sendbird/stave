import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

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
    gap: vars.space2,
    marginLeft: "auto",
  },
  // Preview actions are full bordered cards on a translucent surface; the
  // inline variant is a compact text action with no border.
  actionPreview: {
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 55%, transparent)`,
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontSize: vars.fontSizeCaption,
    gap: 6,
    height: 32,
    justifyContent: "flex-start",
    paddingInline: vars.space8,
  },
  actionInline: {
    fontSize: vars.fontSizeCaption,
    gap: vars.space4,
    height: 28,
    paddingInline: 6,
  },
  // Rollback carries the danger tone only in the roomy preview variant, where
  // its hover fill has room to read as a warning rather than as noise.
  rollbackPreview: {
    backgroundColor: {
      default: null,
      ":hover": vars.colorDangerSoft,
    },
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
  // A disabled action stays legible but inert: no hover recolor, no pointer.
  actionDisabled: {
    backgroundColor: {
      default: null,
      ":hover": "transparent",
    },
    color: {
      default: null,
      ":hover": vars.colorTextMuted,
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
