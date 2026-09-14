import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnModelChipStyles = stylex.create({
  row: {
    display: "inline-flex",
    maxWidth: "100%",
    height: vars["--ads-control-height-xs"],
    alignItems: "center",
    gap: vars["--ads-space-8"],
    overflow: "hidden",
    verticalAlign: "middle",
  },
  nameSegment: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  icon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
  },
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  detail: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-regular"],
    lineHeight: vars["--ads-line-height-tight"],
    color: vars["--ads-color-text-muted"],
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
  fastIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    fill: "currentColor",
  },
});
