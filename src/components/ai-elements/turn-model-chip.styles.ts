import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const turnModelChipStyles = stylex.create({
  row: {
    display: "inline-flex",
    maxWidth: "100%",
    height: vars["--aui-control-height-xs"],
    alignItems: "center",
    gap: vars["--aui-space-8"],
    overflow: "hidden",
    verticalAlign: "middle",
  },
  nameSegment: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  icon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
  },
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  detail: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    lineHeight: vars["--aui-line-height-tight"],
    color: vars["--aui-color-text-muted"],
  },
  context: {
    flexShrink: 0,
  },
  thinking: {
    color: "var(--prompt-role-thinking)",
  },
  fast: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    color: "var(--prompt-role-fast)",
  },
  account: {
    display: "flex",
    minWidth: 0,
    // Shrinks before the model name does.
    flexShrink: 2,
    alignItems: "center",
    gap: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"],
  },
  accountIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
  },
  accountLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  fastIcon: {
    width: vars["--aui-control-icon-size-sm"],
    height: vars["--aui-control-icon-size-sm"],
    fill: "currentColor",
  },
});
