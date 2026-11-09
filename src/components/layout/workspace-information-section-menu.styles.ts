import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Section-visibility dropdown in the Information panel header. */
export const workspaceInformationSectionMenuStyles = stylex.create({
  trigger: { borderRadius: vars["--aui-radius-control"], height: 32, width: 32 },
  triggerIcon: { height: vars["--aui-control-icon-size-sm"], width: vars["--aui-control-icon-size-sm"] },
  content: { width: "14rem" },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemHint: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  resetIcon: { height: 16, width: 16 },
});
