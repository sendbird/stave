import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * A pull request watch is task state, not a message: a compact status chip at
 * the end of the transcript, its PR, state and action read as one unit.
 */
export const taskPullRequestWatchStyles = stylex.create({
  root: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: vars["--aui-space-4"], minWidth: 0, paddingBlock: vars["--aui-space-8"] },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: vars["--aui-space-8"],
    rowGap: vars["--aui-space-2"],
    maxWidth: "100%",
    minHeight: vars["--aui-control-height-sm"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-2"],
    paddingInlineStart: vars["--aui-space-12"],
    paddingInlineEnd: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    borderColor: vars["--aui-color-border-subtle"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
  },
  lead: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  icon: { flexShrink: 0, width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  iconWatching: { color: vars["--aui-color-success-text"] },
  iconPaused: { color: vars["--aui-color-warning-text"] },
  iconIdle: { color: vars["--aui-color-text-muted"] },
  label: {
    flexShrink: 0,
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    fontVariantNumeric: "tabular-nums",
    textDecoration: { default: "none", ":hover": "underline" },
    textUnderlineOffset: 2,
  },
  separator: { color: vars["--aui-color-text-faint"], fontSize: vars["--aui-font-size-caption"] },
  text: { minWidth: 0, margin: 0, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  failure: { margin: 0, fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-danger-text"] },
});
