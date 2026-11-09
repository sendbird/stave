import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const resultStyles = stylex.create({
  // The right rail already paints the surface and pads it. Repeating both here
  // drew a second card inside the first one, so the panel owns layout only.
  panel: { minWidth: 0 },
  agentReport: { marginBottom: vars["--aui-space-12"], fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  heading: {
    margin: 0,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  body: { minWidth: 0 },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    marginBottom: vars["--aui-space-12"],
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
    paddingBottom: vars["--aui-space-8"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border"],
  },
  filterGroup: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"] },
  alertRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  // Collapsed rows are a scan list: one toggle button owns the whole text
  // block so the click target is the row. The result leads, then compact
  // outcome, time and review metadata explain it.
  rowMain: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  rowExpanded: { backgroundColor: vars["--aui-color-surface-tint"] },
  // The AUI trigger lays its children out on a grid; one inner span owns the
  // row layout so the grid sees a single cell.
  rowToggle: { flex: 1, minWidth: 0, textAlign: "start" },
  rowInner: {
    display: "flex",
    minWidth: 0,
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  rowChevron: {
    display: "inline-flex",
    flexShrink: 0,
    marginTop: 2,
    color: vars["--aui-color-text-muted"],
    transitionProperty: "transform",
    transitionDuration: "150ms",
  },
  rowChevronOpen: { transform: "rotate(90deg)" },
  outcomeIcon: { display: "inline-flex", flexShrink: 0, marginTop: 2 },
  outcomeFinished: { color: vars["--aui-color-success-text"] },
  outcomeFailed: { color: vars["--aui-color-danger-text"] },
  rowText: {
    display: "flex",
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  rowMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  summaryClamped: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  rowDetails: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingInline: vars["--aui-space-12"],
    paddingBottom: vars["--aui-space-8"],
  },
  rowActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingTop: vars["--aui-space-8"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
  },
  // Panel prose, not a caption. `introduction`, `loading` and
  // `notice` sat a rung under `error`/`empty` while saying the same kind of
  // thing, so the same register printed at two sizes in one panel.
  introduction: {
    margin: 0,
    maxWidth: "65ch",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  loading: {
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  error: {
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-danger-text"],
  },
  empty: {
    paddingBlock: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  notice: {
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  pagination: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingTop: vars["--aui-space-8"],
  },
  caption: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-text-muted"],
  },
  list: { listStyleType: "none", margin: 0, padding: 0 },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
  },
  rowHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  status: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  reviewState: {
    fontWeight: vars["--aui-font-weight-regular"],
    color: vars["--aui-color-text-muted"],
  },
  timestamp: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  summary: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text"],
  },
  // Container step for the whole evidence block, including the reviewed
  // answer — the panel's actual payload. At Caption it demoted the payload
  // below the summary that introduces it; the run details restate Caption
  // locally. The accordion body paints muted ink, and the answer is content,
  // not a caption, so the block restates the text color. `minWidth: 0` lets a
  // fenced block in the answer scroll inside the panel instead of widening it.
  evidence: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text"],
  },
  evidenceHeading: { fontWeight: vars["--aui-font-weight-medium"] },
  // The answer leads the expanded run: its heading, then the answer as the
  // conversation renders it (collapsed when long), then any shortening note.
  answerSection: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  answerHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  answerAction: { flexShrink: 0 },
  answerHeading: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minWidth: 0,
  },
  files: {
    marginTop: vars["--aui-space-12"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  muted: { color: vars["--aui-color-text-muted"] },
  reference: {
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-text-muted"],
  },
  disclosure: { cursor: "pointer", borderRadius: vars["--aui-radius-mark"] },
  resolution: { marginBottom: vars["--aui-space-12"] },
  modelFacts: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: vars["--aui-space-12"],
    rowGap: 6,
    fontSize: vars["--aui-font-size-caption"],
  },
  modelValue: {
    minWidth: 0,
    overflowWrap: "break-word",
    color: vars["--aui-color-text"],
  },
  modelSource: { color: vars["--aui-color-text"] },
  modelWarn: { color: vars["--aui-color-warning-text"] },
  modelReason: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    color: vars["--aui-color-text"],
  },
});
