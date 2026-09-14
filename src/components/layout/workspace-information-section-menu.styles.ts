import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Section-visibility dropdown in the Information panel header. */
export const workspaceInformationSectionMenuStyles = stylex.create({
  trigger: { borderRadius: vars["--ads-radius-control"], height: 32, width: 32 },
  triggerIcon: { height: vars["--ads-control-icon-size-sm"], width: vars["--ads-control-icon-size-sm"] },
  content: { width: "14rem" },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemHint: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  resetIcon: { height: 16, width: 16 },
});
