import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const activityDetailStyles = stylex.create({
  dialog: { maxWidth: "64rem", width: "calc(100vw - 2rem)", maxHeight: "90dvh", display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  body: { overflowY: "auto", overflowX: "hidden", minHeight: 0, overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: vars["--aui-space-16"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  activitySection: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0, padding: vars["--aui-space-12"], border: `1px solid ${vars["--aui-color-border"]}`, borderRadius: vars["--aui-radius-control"], backgroundColor: vars["--aui-color-surface-tint"] },
  activityHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: vars["--aui-space-12"] },
  activityHeading: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0 },
  heading: { margin: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"] },
  subheading: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"] },
  statusLine: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  logViewport: { maxHeight: "min(42dvh, 30rem)", minHeight: "8rem", overflowY: "auto", overscrollBehavior: "contain", paddingInline: vars["--aui-space-8"], backgroundColor: vars["--aui-color-surface"], border: `1px solid ${vars["--aui-color-border"]}`, borderRadius: vars["--aui-radius-control"] },
  entry: { overflowWrap: "anywhere", minWidth: 0, paddingBlock: vars["--aui-space-8"], borderBottom: `1px solid ${vars["--aui-color-border"]}` },
  summary: { cursor: "pointer", display: "flex", justifyContent: "space-between", gap: vars["--aui-space-12"], fontWeight: vars["--aui-font-weight-medium"], ':focus-visible': { outline: `2px solid ${vars["--aui-color-border-focus"]}`, outlineOffset: 2 } },
  source: { color: vars["--aui-color-text-muted"], flexShrink: 0, fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-regular"] },
  historyGroup: { borderBottom: `1px solid ${vars["--aui-color-border"]}`, paddingBlock: vars["--aui-space-8"] },
  historySummary: { cursor: "pointer", color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"], ':focus-visible': { outline: `2px solid ${vars["--aui-color-border-focus"]}`, outlineOffset: 2 } },
  groupLabel: { marginBlock: `${vars["--aui-space-8"]} ${vars["--aui-space-4"]}`, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"], letterSpacing: "0.04em", textTransform: "uppercase" },
  empty: { margin: 0, paddingBlock: vars["--aui-space-16"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-body"], lineHeight: vars["--aui-line-height-normal"] },
  meta: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], alignItems: "center" },
});
