import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const activityDetailStyles = stylex.create({
  dialog: { maxWidth: "64rem", width: "calc(100vw - 2rem)", maxHeight: "90dvh", display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  body: { overflowY: "auto", overflowX: "hidden", minHeight: 0, overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: vars["--aui-space-16"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  subheading: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"] },
  meta: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], alignItems: "center" },
});
