import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const mq480 = "@media (min-width: 480px)";

export const modelEffortGridStyles = stylex.create({
  // No overflow of its own: an `overflow-x: auto` wrapper here would become the
  // nearest scrollport for the sticky column header, pinning it to a box that
  // never scrolls vertically. The tab panel above already scrolls both axes, so
  // hand horizontal overflow to it and only reserve the grid's own width here.
  scroller: {
    minWidth: "max-content",
    padding: { default: vars["--ads-space-4"], [mq480]: vars["--ads-space-8"] },
  },
  grid: {
    display: "grid",
    width: "100%",
    alignItems: "center",
    columnGap: { default: 0, [mq480]: vars["--ads-space-2"] },
    rowGap: vars["--ads-space-4"],
    "--model-effort-row-width": { default: "6rem", [mq480]: "6.75rem" },
  },
  // One opaque bar spanning every column rather than `display: contents`, so
  // rows scroll under a continuous surface instead of through the column gaps.
  // `subgrid` keeps the effort labels on the same tracks as the cells below.
  headerRow: {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: vars["--ads-z-index-sticky"],
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
    alignItems: "center",
    paddingBlock: vars["--ads-space-4"],
    backgroundColor: vars["--ads-color-surface-raised"],
  },
  columnHeaderModel: {
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  columnHeaderEffort: {
    textAlign: "center",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  rowHeader: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  rowHeaderIcon: { width: "0.875rem", height: "0.875rem" },
  rowHeaderLabel: {
    maxWidth: "8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: `color-mix(in oklch, ${vars["--ads-color-text"]} 90%, transparent)`,
  },
  defaultBadge: {
    display: { default: "none", [mq480]: "inline-flex" },
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  unsupportedCell: {
    display: "flex",
    width: "2.75rem",
    height: "2.75rem",
    alignItems: "center",
    justifyContent: "center",
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 45%, transparent)`,
  },
  unsupportedGlyph: {
    display: "flex",
    width: "2rem",
    height: "2rem",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 65%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 25%, transparent)`,
  },
  unsupportedIcon: { width: "0.75rem", height: "0.75rem" },
  cell: {
    display: "flex",
    width: "2.75rem",
    height: "2.75rem",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: vars["--ads-radius-mark"],
  },
  cellVisual: {
    display: "flex",
    width: "2rem",
    height: "2rem",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-text"]} 5%, transparent)`,
    color: vars["--ads-color-text"],
    boxShadow: vars["--ads-elevation-raised"],
    transitionProperty: "transform",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  cellVisualSelected: { transform: "scale(1.05)" },
  checkIcon: { width: vars["--ads-control-icon-size-md"], height: vars["--ads-control-icon-size-md"] },
  contents: { display: "contents" },
});
