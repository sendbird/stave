import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const taskPullRequestWatchStyles = stylex.create({
  root: { minWidth: 0, paddingBlock: vars["--aui-space-8"] },
  row: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--aui-space-8"], minWidth: 0 },
  icon: { flexShrink: 0, width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], color: vars["--aui-color-text-muted"] },
  text: { flex: "1 1 0%", minWidth: 0, margin: 0, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
});
