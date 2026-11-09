import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { localStack } from "@/lib/ui-layers.stylex";
import { commentJumpMarker } from "./review-comment.stylex";

export const reviewStyles = stylex.create({
  /* Task surface ----------------------------------------------------------- */
  taskSurface: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0 },
  modeBody: { flex: "1 1 auto", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" },
  hidden: { display: "none" },

  /* Review ----------------------------------------------------------------- */
  surface: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0, backgroundColor: vars["--aui-color-canvas"] },
  scopeBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border-subtle"],
  },
  scopeRevision: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    minWidth: 0,
    flex: "1 1 16rem",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  /** The J / K keys and how many reviews wait, at the scope bar's end before Refresh. */
  queueHint: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    whiteSpace: "nowrap",
  },
  queueKeys: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"] },
  sha: { fontFamily: vars["--aui-font-mono"], color: vars["--aui-color-text"] },
  limits: {
    margin: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    listStyle: "none",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border-subtle"],
  },
  layout: { flex: "1 1 auto", minHeight: 0 },
  /* The files, diff and inspector, with the side question docked over them. */
  layoutHost: { position: "relative", display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0, overflow: "hidden" },
  /* Bounded side by side, the regions scroll themselves; once the layout stacks it grows to its content, and this scrolls it. */
  layoutScroll: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0, overflowY: "auto" },
  overlay: { pointerEvents: "none", position: "absolute", inset: 0 },
  /* The task's run, while Review shows ---------------------------------------- */
  taskStatus: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border-subtle"],
  },
  taskStatusWaiting: {
    color: vars["--aui-color-text"],
    backgroundColor: vars["--aui-color-warning-soft"],
  },
  taskStatusText: { flex: "1 1 12rem", minWidth: 0 },
  // Side by side, each region scrolls itself. Stacked (WorkspaceLayout's three-region breakpoint) the
  // layout scrolls instead, and a region that stays a scroll container would hold the diff header's sticky.
  region: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minHeight: 0, minWidth: 0, padding: vars["--aui-space-12"], overflowY: { default: "auto", "@container aui-workspace-layout (max-width: 980px)": "visible" } },
  regionTitle: { margin: 0, display: "flex", alignItems: "baseline", gap: vars["--aui-space-8"], fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"], color: vars["--aui-color-text"] },
  regionAside: { fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-regular"], color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums" },
  note: { margin: 0, fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-normal"], color: vars["--aui-color-text-muted"] },

  /* Files ------------------------------------------------------------------ */
  group: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], margin: 0, padding: 0, listStyle: "none" },
  groupTitle: { margin: 0, marginTop: vars["--aui-space-4"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-medium"], color: vars["--aui-color-text-muted"] },
  fileRow: { width: "100%", justifyContent: "flex-start", gap: vars["--aui-space-8"], textAlign: "start", minHeight: 32, paddingInline: vars["--aui-space-8"] },
  fileStatus: {
    flexShrink: 0,
    width: 16,
    textAlign: "center",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  fileName: { display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 auto", alignItems: "flex-start" },
  fileBase: { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text"] },
  fileDir: { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  fileCounts: { flexShrink: 0, fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  fileRead: { flexShrink: 0, width: 14, height: 14, color: vars["--aui-color-text-muted"] },
  fileUnread: { flexShrink: 0, width: 14, height: 14 },
  output: {
    margin: 0,
    padding: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxHeight: "12rem",
    overflowY: "auto",
  },

  /* Diff ------------------------------------------------------------------- */
  /* Sticks over the region's top padding so the diff never shows above it while scrolling; stacked, the
     layout scroller has no padding, so it sticks at its edge. */
  diffHeader: { position: "sticky", top: { default: `calc(-1 * ${vars["--aui-space-12"]})`, "@container aui-workspace-layout (max-width: 980px)": 0 }, zIndex: localStack["--stave-stack-raised"], display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, marginBlockStart: `calc(-1 * ${vars["--aui-space-12"]})`, paddingBlock: vars["--aui-space-8"], backgroundColor: vars["--aui-color-canvas"], borderBottomWidth: vars["--aui-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border-subtle"] },
  // The header's one action keeps its full label; the path gives up its directory first.
  diffAction: { flexShrink: 0 },
  diffTitle: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], flex: "1 1 auto", minWidth: 0 },
  diffRenamed: { fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-micro"], color: vars["--aui-color-text-subtle"], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  diffBody: { minHeight: 0, minWidth: 0 },

  /* Inspector -------------------------------------------------------------- */
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  sectionTitle: { margin: 0, fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"], color: vars["--aui-color-text-muted"], textTransform: "none" },
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none" },
  comment: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0, fontSize: vars["--aui-font-size-caption"] },
  /** A pending comment: the row that opens its line, and Remove beside it. */
  commentRow: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-4"], minWidth: 0 },
  /** A sent comment: the row, then whether its lines changed and Resolve. */
  commentStack: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0 },
  commentJump: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--aui-space-2"],
    flex: "1 1 auto",
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-4"],
    marginInline: `calc(-1 * ${vars["--aui-space-4"]})`,
    borderRadius: vars["--aui-radius-control"],
    fontSize: vars["--aui-font-size-caption"],
    textAlign: "start",
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
  },
  // The jump mark shows on the row's hover and keyboard focus only (always on
  // a touch screen), so a list of rows does not read as a column of arrows.
  // It keeps its room either way, so the path never shifts under the pointer.
  commentJumpIcon: {
    flexShrink: 0,
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
    opacity: {
      default: 0,
      [stylex.when.ancestor(":is(:hover, :focus-visible)", commentJumpMarker)]: 1,
      "@media (hover: none)": 1,
    },
  },
  // Path and sent time share a line while they fit; in a narrow panel the time
  // drops below instead of truncating the path.
  commentWhereLine: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-4"], rowGap: 0, minWidth: 0 },
  // The path keeps its jump mark beside it; only a path longer than the whole
  // line truncates.
  commentWhereHead: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, maxWidth: "100%" },
  commentWhere: {
    minWidth: 0,
    flexShrink: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    color: vars["--aui-color-text-muted"],
  },
  commentSentAt: { fontSize: vars["--aui-font-size-caption"], lineHeight: "16px", color: vars["--aui-color-text-muted"] },
  commentBody: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: vars["--aui-color-text"] },
  commentSentRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  commentSentState: { fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-medium"], color: vars["--aui-color-text-muted"] },
  /** The editor's word for lines changed since sending, in the same ink. */
  commentSentStateChanged: { color: vars["--aui-color-success-text"] },
  // A pending comment's delete: quiet at rest, danger under the pointer and
  // keyboard focus, as the editor's own remove button.
  commentRemove: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-danger"],
      ":focus-visible": vars["--aui-color-danger"],
    },
  },
  lensRecord: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0 },
  lensPage: { fontSize: vars["--aui-font-size-caption"], lineHeight: "16px", color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  decisions: {
    flexShrink: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
  },
  feedbackForm: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], marginTop: vars["--aui-space-8"] },
  feedbackActions: { display: "flex", justifyContent: "flex-end", gap: vars["--aui-space-8"] },
});
