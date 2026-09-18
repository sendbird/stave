import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const activityDetailStyles = stylex.create({
  dialog: { maxWidth: "64rem", width: "calc(100vw - 2rem)", maxHeight: "90dvh", display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  body: { overflowY: "auto", overflowX: "hidden", minHeight: 0, overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: vars["--ads-space-16"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  entry: { overflowWrap: "anywhere", minWidth: 0, paddingBlock: vars["--ads-space-8"], borderBottom: `1px solid ${vars["--ads-color-border"]}` },
  summary: { cursor: "pointer", fontWeight: vars["--ads-font-weight-medium"], ':focus-visible': { outline: `2px solid ${vars["--ads-color-text"]}` } },
  meta: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], overflowWrap: "anywhere" },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-8"], alignItems: "center" },
});
