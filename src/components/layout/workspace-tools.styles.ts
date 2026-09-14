import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
export const toolStyles = stylex.create({
  quickAddClosed: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  quickAddForm: { display: "grid", gap: vars["--ads-space-12"], padding: vars["--ads-space-12"], color: vars["--ads-color-text"] },
  fieldLabel: { display: "block", fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"] },
  commandInput: { minHeight: 80, width: "100%", resize: "vertical", fontFamily: vars["--ads-font-mono"], fontSize: vars["--ads-font-size-caption"] },
  formActions: { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: vars["--ads-space-8"] },
  duration: { fontVariantNumeric: "tabular-nums" },
  url: { marginTop: vars["--ads-space-4"], display: "inline-flex", maxWidth: "100%", alignItems: "center", gap: 6, borderRadius: vars["--ads-radius-control"], backgroundColor: { default: vars["--ads-color-surface-tint"], ":hover": vars["--ads-color-selection-fill"], ":active": vars["--ads-color-surface-tint"] }, paddingInline: vars["--ads-space-8"], paddingBlock: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  smallIcon: { width: 12, height: 12, flexShrink: 0 },
  externalIcon: { width: 12, height: 12, flexShrink: 0, opacity: 0.6 },
  truncated: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  hint: { fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-text-muted"] },
  urlHint: { flexShrink: 0, fontSize: vars["--ads-font-size-micro"], lineHeight: "16px", color: vars["--ads-color-text-muted"] },
  section: { borderTopWidth: { default: 1, ":first-child": 0 }, borderTopStyle: "solid", borderTopColor: vars["--ads-color-border"] },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBlock: 10 },
  sectionTitle: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"], color: vars["--ads-color-text-muted"] },
  sectionCount: { fontSize: vars["--ads-font-size-micro"], fontVariantNumeric: "tabular-nums", color: vars["--ads-color-text-muted"] },
  compactEmpty: { flex: "none", gap: vars["--ads-space-8"], paddingInline: vars["--ads-space-16"], paddingBlock: vars["--ads-space-20"] },
  compactHeader: { gap: vars["--ads-space-4"] },
  compactMedia: { marginBottom: 0 },
  compactTitle: { fontSize: vars["--ads-font-size-body"] },
  description: { fontSize: vars["--ads-font-size-caption"], lineHeight: vars["--ads-line-height-control"], color: vars["--ads-color-text-muted"] },
  hook: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: vars["--ads-space-12"], borderBottomWidth: { default: 1, ":last-child": 0 }, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"], paddingBlock: vars["--ads-space-12"] },
  hookText: { minWidth: 0, display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  title: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  muted: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  truncatedHint: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-text-muted"] },
  runButton: { height: 32, borderRadius: vars["--ads-radius-control"], paddingInline: 10 },
  loader: { marginRight: vars["--ads-space-4"] },
  runIcon: { marginRight: vars["--ads-space-4"], width: 14, height: 14 },
  entry: { borderBottomWidth: { default: 1, ":last-child": 0 }, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"], paddingBlock: vars["--ads-space-12"] },
  selected: { backgroundColor: vars["--ads-color-selection-fill"] },
  entryHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: vars["--ads-space-12"] },
  entryBody: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: vars["--ads-space-2"] },
  entryTitleRow: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--ads-space-8"], rowGap: vars["--ads-space-2"] },
  inspect: { textAlign: "start", fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"], textDecorationLine: { default: "none", ":hover": "underline" } },
  stateRow: { display: "flex", alignItems: "center", gap: 6, fontSize: vars["--ads-font-size-micro"] },
  running: { display: "inline-flex", alignItems: "center", gap: vars["--ads-space-4"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-accent"] },
  runningMark: { width: 6, height: 6, borderRadius: 9999, backgroundColor: vars["--ads-color-accent"] },
  separator: { color: vars["--ads-color-text-subtle"] },
  metadata: { color: vars["--ads-color-text-muted"] },
  finished: { display: "inline-flex", alignItems: "center", gap: vars["--ads-space-4"], color: vars["--ads-color-text-muted"] },
  failed: { fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-danger-text"] },
  success: { fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-success-text"] },
  detail: { fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-text-subtle"] },
  actions: { display: "flex", alignItems: "center", gap: 6 },
  iconButton: { width: 28, height: 28, borderRadius: vars["--ads-radius-control"] },
  icon: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"] },
  sectionIcon: { width: vars["--ads-control-icon-size-md"], height: vars["--ads-control-icon-size-md"] },
  view: { paddingInline: vars["--ads-space-12"], paddingBlock: vars["--ads-space-8"] },
  loading: { paddingInline: vars["--ads-space-4"], paddingBlock: vars["--ads-space-16"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  quickAdd: { marginTop: vars["--ads-space-4"], width: "100%", maxWidth: "24rem" },
  setup: { paddingInline: vars["--ads-space-8"], paddingBlock: vars["--ads-space-32"], textAlign: "center" },
  setupAction: { marginTop: vars["--ads-space-16"] },
  addForm: { marginBottom: vars["--ads-space-12"] },
  viewDescription: { paddingInline: vars["--ads-space-4"], paddingBottom: vars["--ads-space-12"], fontSize: vars["--ads-font-size-caption"], lineHeight: "20px", color: vars["--ads-color-text-muted"] },
  inactive: { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: vars["--ads-color-border"], paddingInline: vars["--ads-space-8"], paddingBlock: vars["--ads-space-24"], textAlign: "center" },
  inactiveHint: { marginTop: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], lineHeight: "20px", color: vars["--ads-color-text-muted"] },
  settingsButton: { marginTop: vars["--ads-space-4"], height: 32, borderRadius: vars["--ads-radius-control"] },
  settingsIcon: { marginRight: vars["--ads-space-4"], width: 16, height: 16 },
  panel: { display: "flex", height: "100%", minHeight: 0, flexDirection: "column", overflow: "hidden" },
  /*
   * The panel is mounted inside `RightRailPanelShell`, which already paints the
   * 46px panel bar with the "Workspace Tools" title and icon (see
   * `panel-bar.constants.ts`). This header is therefore a SUBHEAD, not a second
   * panel title: it used to restate the title in a wrapping `headingRow`, which
   * is what pushed the workspace name, the actions, the description, and the
   * search field onto four different rhythms above the tabs.
   *
   * Now it is one 40px toolbar row (`controlHeightLg`, the rung below the 46px
   * bar above it) plus a stacked description and search field, all on the same
   * `space12` inline gutter as every other right-rail panel header and
   * separated by a single `space8` gap.
   */
  header: { flexShrink: 0, display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"], paddingInline: vars["--ads-space-12"], paddingBottom: vars["--ads-space-12"] },
  headingRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-8"], minHeight: vars["--ads-control-height-lg"], height: vars["--ads-control-height-lg"], flexShrink: 0 },
  heading: { minWidth: 0, display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  workspaceName: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], lineHeight: vars["--ads-line-height-control"], color: vars["--ads-color-text"] },
  headerActions: { display: "flex", alignItems: "center", gap: vars["--ads-space-4"], flexShrink: 0, marginInlineStart: "auto" },
  refreshing: { animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" }, animationDuration: "1s", animationTimingFunction: "linear", animationIterationCount: "infinite" },
  configError: { flexShrink: 0, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-danger-border"], paddingInline: vars["--ads-space-12"], paddingBlock: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-danger-text"] },
  search: { minHeight: 0, flex: 1, overflow: "auto", padding: vars["--ads-space-12"] },
  noResults: { paddingBlock: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  views: { display: "flex", minHeight: 0, flex: 1, flexDirection: "column" },
  hidden: { display: "none" },
  output: { maxHeight: "45%", flexShrink: 0, overflow: "auto", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: vars["--ads-color-border"], backgroundColor: vars["--ads-color-canvas"], padding: vars["--ads-space-12"] },
  outputHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-8"] },
  outputTitle: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-semibold"] },
  noOutput: { paddingBlock: vars["--ads-space-12"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
});
