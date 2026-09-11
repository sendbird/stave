import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const collaborationStyles = stylex.create({
  panelStack: { display: "flex", flexDirection: "column", gap: vars.space16 },
  contentStack: { display: "flex", flexDirection: "column", gap: vars.space12 },
  // A bare <fieldset> keeps the user-agent `2px groove` border because the
  // global reset overrides only border-color, not border-style/width. Left
  // unreset it draws a heavy dark rectangle inside the card — a second surface
  // for one form. This fieldset is a grouping/disable wrapper with no legend,
  // so drop its box entirely and let contentStack spacing separate the group.
  fieldsetReset: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    minWidth: 0,
    borderWidth: 0,
    borderStyle: "none",
    margin: 0,
    padding: 0,
  },
  compactStack: { display: "flex", flexDirection: "column", gap: vars.space8 },
  librarySectionStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  sectionStack: { display: "flex", flexDirection: "column", gap: vars.space12 },
  sectionDivider: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingTop: vars.space24,
  },
  article: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    borderBottomWidth: 1,
    borderBottomStyle: { default: "solid", ":last-of-type": "none" },
    borderBottomColor: vars.colorBorder,
    paddingBottom: vars.space20,
  },
  articleCompact: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    borderBottomWidth: 1,
    borderBottomStyle: { default: "solid", ":last-of-type": "none" },
    borderBottomColor: vars.colorBorder,
    paddingBottom: vars.space20,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  rowBetween: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
    paddingBottom: vars.space12,
  },
  wrap: { display: "flex", flexWrap: "wrap", gap: vars.space8 },
  // Panel prose, not a caption: `body` carries every status line, alert and
  // empty state in this panel, so it sits on the 14px control-text baseline.
  // `bodyRelaxed` was the same Caption text with relaxed leading — relaxed
  // leading is for readable prose, so the size moved and the key collapsed
  // into `body` rather than leaving two names for one treatment.
  body: { fontSize: vars.fontSizeBody, lineHeight: vars.lineHeightNormal },
  muted: { color: vars.colorTextMuted },
  danger: { color: vars.colorDangerText },
  warning: { color: vars.colorWarningText },
  // One section-header treatment: `heading` (Caption) and `headingBody` (Body)
  // dressed the same <h3>/<h4> role at two steps in one file, so the panel's
  // headers disagreed by a rung depending on which key a call site reached
  // for. Body semibold is the section-header step; `headingBody` is gone.
  heading: {
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    fontWeight: vars.fontWeightSemibold,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  // Fixed-height label text keeps sibling controls in one grid row on the
  // same baseline even when a label wraps or is longer than its neighbours.
  labelText: {
    display: "block",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
    lineHeight: vars.lineHeightNormal,
  },
  searchField: {
    width: "100%",
    paddingInline: vars.space12,
  },
  card: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    padding: vars.space12,
  },
  details: {
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  detailsMuted: {
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    color: vars.colorTextMuted,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    alignItems: "end",
    gap: vars.space12,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
  checkboxNote: { display: "block", marginTop: vars.space4 },
  submitRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space12,
  },
  definitionList: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: vars.space12,
    rowGap: 6,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
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
  marginTop1: { marginTop: vars.space4 },
  marginTop2: { marginTop: vars.space8 },
  marginTop3: { marginTop: vars.space12 },
  marginBottom2: { marginBottom: vars.space8 },
  marginBottom3: { marginBottom: vars.space12 },
  marginY2: { marginBlock: vars.space8 },
  marginY3: { marginBlock: vars.space12 },
});
