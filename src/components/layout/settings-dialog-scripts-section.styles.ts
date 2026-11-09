import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const scriptsSectionStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
  },
  emptyState: {
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
  },
  emptyIcon: {
    inlineSize: vars["--aui-control-icon-size-md"],
    blockSize: vars["--aui-control-icon-size-md"],
  },
});
