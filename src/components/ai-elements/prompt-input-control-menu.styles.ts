import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const controlMenuStyles = stylex.create({
  segmentGroup: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--aui-space-2"],
    borderRadius: vars["--aui-radius-control"],
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 60%, transparent)`,
    padding: vars["--aui-space-2"],
  },
  segment: {
    borderRadius: "5px",
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  segmentSelected: {
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text"],
    boxShadow: vars["--aui-elevation-raised"],
  },
  segmentUnselected: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 40%, transparent)`,
    },
  },
  rowLabel: { minWidth: 0 },
  rowTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text"],
  },
  rowDescription: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  footerNote: {
    paddingInline: vars["--aui-space-8"],
    paddingTop: 6,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  resetWrap: {
    paddingInline: vars["--aui-space-8"],
    paddingTop: vars["--aui-space-4"],
  },
  resetButton: {
    gap: 6,
    fontSize: vars["--aui-font-size-caption"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  resetIcon: { width: 12, height: 12 },
});
