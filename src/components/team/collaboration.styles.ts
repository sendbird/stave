import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const collaborationStyles = stylex.create({
  panelStack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-16"] },
  contentStack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  // A bare <fieldset> keeps the user-agent `2px groove` border because the
  // global reset overrides only border-color, not border-style/width. Left
  // unreset it draws a heavy dark rectangle inside the card — a second surface
  // for one form. This fieldset is a grouping/disable wrapper with no legend,
  // so drop its box entirely and let contentStack spacing separate the group.
  fieldsetReset: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    minWidth: 0,
    borderWidth: 0,
    borderStyle: "none",
    margin: 0,
    padding: 0,
  },
  compactStack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  librarySectionStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  sectionStack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  sectionDivider: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingTop: vars["--ads-space-24"],
  },
  article: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    borderBottomWidth: 1,
    borderBottomStyle: { default: "solid", ":last-of-type": "none" },
    borderBottomColor: vars["--ads-color-border"],
    paddingBottom: vars["--ads-space-20"],
  },
  articleCompact: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderBottomWidth: 1,
    borderBottomStyle: { default: "solid", ":last-of-type": "none" },
    borderBottomColor: vars["--ads-color-border"],
    paddingBottom: vars["--ads-space-20"],
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  // One control row for the panel: the filters that narrow the list and the
  // export that saves it. `Export report` used to hang off the end of the
  // panel's description sentence, which read as a caption with a button glued
  // to it; prose and controls are now separate rows.
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
    paddingBottom: vars["--ads-space-12"],
  },
  // New work starts before the historical list. A single divider keeps this
  // entry distinct without adding another card surface inside the right rail.
  delegateEntry: {
    display: "flex",
    flexDirection: "column",
    paddingBottom: vars["--ads-space-16"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
  },
  wrap: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-8"] },
  // Panel prose, not a caption: `body` carries every status line, alert and
  // empty state in this panel, so it sits on the 14px control-text baseline.
  // `bodyRelaxed` was the same Caption text with relaxed leading — relaxed
  // leading is for readable prose, so the size moved and the key collapsed
  // into `body` rather than leaving two names for one treatment.
  body: { fontSize: vars["--ads-font-size-body"], lineHeight: vars["--ads-line-height-normal"] },
  muted: { color: vars["--ads-color-text-muted"] },
  danger: { color: vars["--ads-color-danger-text"] },
  warning: { color: vars["--ads-color-warning-text"] },
  // One section-header treatment: `heading` (Caption) and `headingBody` (Body)
  // dressed the same <h3>/<h4> role at two steps in one file, so the panel's
  // headers disagreed by a rung depending on which key a call site reached
  // for. Body semibold is the section-header step; `headingBody` is gone.
  heading: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  // Fixed-height label text keeps sibling controls in one grid row on the
  // same baseline even when a label wraps or is longer than its neighbours.
  labelText: {
    display: "block",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  searchField: {
    width: "100%",
    paddingInline: vars["--ads-space-12"],
  },
  card: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    padding: vars["--ads-space-12"],
  },
  details: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  detailsMuted: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    alignItems: "end",
    gap: vars["--ads-space-12"],
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  checkboxNote: { display: "block", marginTop: vars["--ads-space-4"] },
  submitRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-12"],
  },
  definitionList: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: vars["--ads-space-12"],
    rowGap: 6,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  minZero: { minWidth: 0 },
  breakWords: { overflowWrap: "break-word" },
  breakAll: { overflowWrap: "anywhere" },
  preWrap: { whiteSpace: "pre-wrap" },
  cursor: { cursor: "pointer" },
  selfStart: { alignSelf: "flex-start" },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  marginTop1: { marginTop: vars["--ads-space-4"] },
  marginTop2: { marginTop: vars["--ads-space-8"] },
  marginTop3: { marginTop: vars["--ads-space-12"] },
  marginBottom2: { marginBottom: vars["--ads-space-8"] },
  marginBottom3: { marginBottom: vars["--ads-space-12"] },
  marginY2: { marginBlock: vars["--ads-space-8"] },
  marginY3: { marginBlock: vars["--ads-space-12"] },
});
