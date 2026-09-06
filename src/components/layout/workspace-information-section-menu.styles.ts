import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Section-visibility dropdown in the Information panel header. */
export const workspaceInformationSectionMenuStyles = stylex.create({
  trigger: { borderRadius: vars.radiusControl, height: 32, width: 32 },
  triggerIcon: { height: vars.controlIconSizeSm, width: vars.controlIconSizeSm },
  content: { width: "14rem" },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemHint: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  resetIcon: { height: 16, width: 16 },
});
