import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const resultStyles = stylex.create({
  // The right rail already paints the surface and pads it. Repeating both here
  // drew a second card inside the first one, so the panel owns layout only.
  panel: { minWidth: 0 },
  heading: {
    marginBottom: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  body: { minWidth: 0 },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    marginBottom: vars["--ads-space-12"],
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    paddingBottom: vars["--ads-space-8"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
  },
  filterGroup: { display: "flex", alignItems: "center", gap: vars["--ads-space-4"] },
  alertRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  // Collapsed rows are a scan list: one toggle button owns the whole text
  // block so the click target is the row, and the summary clamps to two
  // lines until the run is opened.
  rowMain: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  rowExpanded: { backgroundColor: vars["--ads-color-surface-tint"] },
  // The ADS trigger lays its children out on a grid; one inner span owns the
  // row layout so the grid sees a single cell.
  rowToggle: { flex: 1, minWidth: 0, textAlign: "start" },
  rowInner: {
    display: "flex",
    minWidth: 0,
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  rowAction: { flexShrink: 0, marginTop: vars["--ads-space-4"] },
  rowChevron: {
    display: "inline-flex",
    flexShrink: 0,
    marginTop: 2,
    color: vars["--ads-color-text-muted"],
    transitionProperty: "transform",
    transitionDuration: "150ms",
  },
  rowChevronOpen: { transform: "rotate(90deg)" },
  outcomeIcon: { display: "inline-flex", flexShrink: 0, marginTop: 2 },
  outcomeFinished: { color: vars["--ads-color-success-text"] },
  outcomeFailed: { color: vars["--ads-color-danger-text"] },
  rowText: {
    display: "flex",
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  rowMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  summaryClamped: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    color: vars["--ads-color-text-muted"],
  },
  rowDetails: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    paddingBottom: vars["--ads-space-8"],
  },
  // A saved answer has no length bound of its own, so an expanded run used to
  // push every later run — and the panel footer — kilopixels down the scroller.
  // The cap belongs to the payload: the row header and the follow-up action
  // stay on screen while the answer scrolls inside its own box.
  evidenceViewport: { minWidth: 0 },
  rowActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingTop: vars["--ads-space-8"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-8"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
  },
  // Panel prose, not a caption. `introduction`, `guidance`, `loading` and
  // `notice` sat a rung under `error`/`empty` while saying the same kind of
  // thing, so the same register printed at two sizes in one panel.
  introduction: {
    maxWidth: "65ch",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  navigation: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  guidance: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  loading: {
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  error: {
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-danger-text"],
  },
  empty: {
    paddingBlock: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  notice: {
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  pagination: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingTop: vars["--ads-space-8"],
  },
  caption: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text-muted"],
  },
  list: { listStyleType: "none", margin: 0, padding: 0 },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
  },
  rowHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  status: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  reviewState: {
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-muted"],
  },
  timestamp: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  summary: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  // Container step for the whole evidence block, including the reviewed
  // answer — the panel's actual payload. At Caption it demoted the payload
  // below the summary that introduces it; the descendants that are genuinely
  // metadata (`filePath`, `snapshotSummary`, `code`) restate Caption locally.
  evidence: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"],
  },
  evidenceHeading: { fontWeight: vars["--ads-font-weight-medium"] },
  evidenceDescription: { marginBlock: vars["--ads-space-8"], color: vars["--ads-color-text-muted"] },
  answer: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  excerptNotice: { marginTop: vars["--ads-space-8"], color: vars["--ads-color-text-muted"] },
  files: {
    marginTop: vars["--ads-space-12"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  filePath: {
    wordBreak: "break-all",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  muted: { color: vars["--ads-color-text-muted"] },
  reference: {
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text-muted"],
  },
  disclosure: { cursor: "pointer", borderRadius: vars["--ads-radius-mark"] },
  resolution: { marginBottom: vars["--ads-space-12"] },
  runId: { wordBreak: "break-all", paddingBlock: vars["--ads-space-4"] },
  messageId: { wordBreak: "break-all" },
  snapshot: {
    minWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingBlock: vars["--ads-space-8"],
  },
  snapshotSummary: {
    cursor: "pointer",
    wordBreak: "break-all",
    borderRadius: vars["--ads-radius-mark"],
    paddingBlock: vars["--ads-space-4"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  snapshotContent: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-8"],
  },
  snapshotSide: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  code: {
    maxHeight: "12rem",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-surface-tint"],
    padding: vars["--ads-space-8"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text"],
  },
  snapshots: { marginTop: vars["--ads-space-12"], minWidth: 0 },
  snapshotsHeading: {
    marginBottom: vars["--ads-space-4"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  snapshotsDescription: {
    marginBottom: vars["--ads-space-8"],
    color: vars["--ads-color-text-muted"],
  },
  uncaptured: {
    wordBreak: "break-all",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingBlock: vars["--ads-space-8"],
  },
  mono: { fontFamily: vars["--ads-font-mono"] },
  modelFacts: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: vars["--ads-space-12"],
    rowGap: 6,
    fontSize: vars["--ads-font-size-caption"],
  },
  modelValue: {
    minWidth: 0,
    overflowWrap: "break-word",
    color: vars["--ads-color-text"],
  },
  modelSource: { color: vars["--ads-color-text"] },
  modelReason: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    color: vars["--ads-color-text"],
  },
});
