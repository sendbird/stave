import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const activityDetailStyles = stylex.create({
  dialog: { maxWidth: "64rem", width: "calc(100vw - 2rem)", maxHeight: "90dvh", display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  body: { overflowY: "auto", overflowX: "hidden", minHeight: 0, overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: vars["--ads-space-16"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  activitySection: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0, padding: vars["--ads-space-12"], border: `1px solid ${vars["--ads-color-border"]}`, borderRadius: vars["--ads-radius-control"], backgroundColor: vars["--ads-color-surface-tint"] },
  activityHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: vars["--ads-space-12"] },
  activityHeading: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], minWidth: 0 },
  heading: { margin: 0, fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-semibold"] },
  subheading: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"] },
  statusLine: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], overflowWrap: "anywhere" },
  logViewport: { maxHeight: "min(42dvh, 30rem)", minHeight: "8rem", overflowY: "auto", overscrollBehavior: "contain", paddingInline: vars["--ads-space-8"], backgroundColor: vars["--ads-color-surface"], border: `1px solid ${vars["--ads-color-border"]}`, borderRadius: vars["--ads-radius-control"] },
  entry: { overflowWrap: "anywhere", minWidth: 0, paddingBlock: vars["--ads-space-8"], borderBottom: `1px solid ${vars["--ads-color-border"]}` },
  summary: { cursor: "pointer", display: "flex", justifyContent: "space-between", gap: vars["--ads-space-12"], fontWeight: vars["--ads-font-weight-medium"], ':focus-visible': { outline: `2px solid ${vars["--ads-color-border-focus"]}`, outlineOffset: 2 } },
  source: { color: vars["--ads-color-text-muted"], flexShrink: 0, fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-regular"] },
  historyGroup: { borderBottom: `1px solid ${vars["--ads-color-border"]}`, paddingBlock: vars["--ads-space-8"] },
  historySummary: { cursor: "pointer", color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"], ':focus-visible': { outline: `2px solid ${vars["--ads-color-border-focus"]}`, outlineOffset: 2 } },
  groupLabel: { marginBlock: `${vars["--ads-space-8"]} ${vars["--ads-space-4"]}`, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"], letterSpacing: "0.04em", textTransform: "uppercase" },
  empty: { margin: 0, paddingBlock: vars["--ads-space-16"], color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-body"], lineHeight: vars["--ads-line-height-normal"] },
  meta: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], overflowWrap: "anywhere" },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-8"], alignItems: "center" },
});
