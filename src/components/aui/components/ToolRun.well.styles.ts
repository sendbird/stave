import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/** Styles for `ToolRun.well.tsx` — the tint-row variant of a tool call. */

/** The well root is the container; below this the summary wraps under. */
const NARROW = "@container (max-width: 360px)";
export const toolRunWellStyles = stylex.create({
  root: {
    backgroundColor: vars["--aui-color-overlay-hover"],
    borderRadius: vars["--aui-radius-control"],
    containerType: "inline-size",
    gap: 0,
    minInlineSize: 0,
  },
  // The shared trigger is a flex row; the well lays it out as a grid so the
  // tool name may give way while the title keeps a readable share.
  row: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "grid",
    fontSize: vars["--aui-font-size-caption"],
    gridTemplateColumns: {
      default: "auto minmax(0, max-content) minmax(5rem, 1fr) auto",
      // A narrow owner (a chat preview, a phone column): what the call did
      // takes its own line under the tool name instead of a 5rem sliver.
      [NARROW]: "auto minmax(0, 1fr) auto",
    },
    rowGap: vars["--aui-space-2"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  staticRow: {
    boxSizing: "border-box",
    color: vars["--aui-color-text-muted"],
    minBlockSize: vars["--aui-control-height-sm"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--aui-opacity-disabled"],
  },
  mark: {
    alignItems: "center",
    display: "inline-flex",
    justifyContent: "center",
  },
  markLive: { color: vars["--aui-color-info"] },
  markSuccess: { color: vars["--aui-color-success-text"] },
  markWarning: { color: vars["--aui-color-warning-text"] },
  markDanger: { color: vars["--aui-color-danger-text"] },
  markNeutral: { color: vars["--aui-color-text-subtle"] },
  lead: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  icon: {
    color: vars["--aui-color-text-subtle"],
    display: "inline-flex",
  },
  tool: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // The title wraps rather than clips: what the call did stays readable in a
  // narrow owner, and the tool name is the value that gives way first.
  summary: {
    gridColumn: { default: "auto", [NARROW]: "2 / -1" },
    gridRow: { default: "auto", [NARROW]: "2" },
    alignItems: "baseline",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
  },
  title: {
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  titleLead: {
    color: vars["--aui-color-text"],
  },
  count: {
    color: vars["--aui-color-text-subtle"],
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  trail: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-8"],
    whiteSpace: "nowrap",
  },
  word: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  duration: {
    color: vars["--aui-color-text-subtle"],
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  body: {
    display: "grid",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
    paddingBlockEnd: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-8"],
    // Under the tool name: the 8px row inset + the glyph slot + one gap.
    paddingInlineStart: `calc(${vars["--aui-space-8"]} * 2 + ${vars["--aui-control-icon-size-md"]})`,
  },
  section: {
    display: "grid",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
  },
  sectionLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  plate: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderRadius: vars["--aui-radius-mark"],
    boxShadow: `inset 0 0 0 ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-border-subtle"]}`,
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantLigatures: "none",
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
    whiteSpace: "pre-wrap",
  },
  plateDanger: {
    backgroundColor: vars["--aui-color-danger-soft"],
    color: vars["--aui-color-danger-text"],
  },
  actions: {
    display: "flex",
    justifyContent: "flex-start",
  },
});
