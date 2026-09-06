import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Fixed unsaved-changes alert pinned to the bottom-left of the shell. */
export const workspaceSaveNoticeStyles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorDangerBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    bottom: vars.space40,
    boxShadow: vars.elevationOverlay,
    color: vars.colorText,
    display: "flex",
    gap: vars.space12,
    insetInlineStart: vars.space12,
    maxWidth: "min(36rem, calc(100vw - 1.5rem))",
    padding: vars.space12,
    position: "fixed",
    zIndex: vars.zIndexToast,
  },
  message: { fontSize: vars.fontSizeBody },
});
