import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const controlMenuStyles = stylex.create({
  segmentGroup: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-2"],
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 60%, transparent)`,
    padding: vars["--ads-space-2"],
  },
  segment: {
    borderRadius: "5px",
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  segmentSelected: {
    backgroundColor: vars["--ads-color-surface"],
    color: vars["--ads-color-text"],
    boxShadow: vars["--ads-elevation-raised"],
  },
  segmentUnselected: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 40%, transparent)`,
    },
  },
  rowLabel: { minWidth: 0 },
  rowTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  rowDescription: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  footerNote: {
    paddingInline: vars["--ads-space-8"],
    paddingTop: 6,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  resetWrap: {
    paddingInline: vars["--ads-space-8"],
    paddingTop: vars["--ads-space-4"],
  },
  resetButton: {
    gap: 6,
    fontSize: vars["--ads-font-size-caption"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  resetIcon: { width: 12, height: 12 },
});
