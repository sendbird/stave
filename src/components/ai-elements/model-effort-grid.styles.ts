import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

const mq480 = "@media (min-width: 480px)";

export const modelEffortGridStyles = stylex.create({
  // No overflow of its own: an `overflow-x: auto` wrapper here would become the
  // nearest scrollport for the sticky column header, pinning it to a box that
  // never scrolls vertically. The tab panel above already scrolls both axes, so
  // hand horizontal overflow to it and only reserve the grid's own width here.
  scroller: {
    minWidth: "max-content",
    padding: { default: vars["--aui-space-4"], [mq480]: vars["--aui-space-8"] },
  },
  grid: {
    display: "grid",
    width: "100%",
    alignItems: "center",
    columnGap: { default: 0, [mq480]: vars["--aui-space-2"] },
    rowGap: vars["--aui-space-4"],
    "--model-effort-row-width": { default: "6rem", [mq480]: "6.75rem" },
  },
  // One opaque bar spanning every column rather than `display: contents`, so
  // rows scroll under a continuous surface instead of through the column gaps.
  // `subgrid` keeps the effort labels on the same tracks as the cells below.
  headerRow: {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: vars["--aui-z-index-sticky"],
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
    alignItems: "center",
    paddingBlock: vars["--aui-space-4"],
    backgroundColor: vars["--aui-color-surface-raised"],
  },
  columnHeaderModel: {
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  columnHeaderEffort: {
    textAlign: "center",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  rowHeader: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  rowHeaderIcon: { width: "0.875rem", height: "0.875rem" },
  rowHeaderLabel: {
    maxWidth: "8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: `color-mix(in oklch, ${vars["--aui-color-text"]} 90%, transparent)`,
  },
  defaultBadge: {
    display: { default: "none", [mq480]: "inline-flex" },
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-canvas-subtle"],
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--aui-font-size-micro"],
    color: vars["--aui-color-text-muted"],
  },
  unsupportedCell: {
    display: "flex",
    width: "2.75rem",
    height: "2.75rem",
    alignItems: "center",
    justifyContent: "center",
    color: vars["--aui-color-text-muted"],
  },
  unsupportedGlyph: {
    display: "flex",
    width: "2rem",
    height: "2rem",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 65%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 25%, transparent)`,
  },
  unsupportedIcon: { width: "0.75rem", height: "0.75rem" },
  cell: {
    display: "flex",
    width: "2.75rem",
    height: "2.75rem",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: vars["--aui-radius-mark"],
  },
  cellVisual: {
    display: "flex",
    width: "2rem",
    height: "2rem",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-text"]} 5%, transparent)`,
    color: vars["--aui-color-text"],
    boxShadow: vars["--aui-elevation-raised"],
    transitionProperty: "transform",
    transitionDuration: {
      default: vars["--aui-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  cellVisualSelected: { transform: "scale(1.05)" },
  checkIcon: { width: vars["--aui-control-icon-size-md"], height: vars["--aui-control-icon-size-md"] },
  contents: { display: "contents" },
  /** A section's name across every column; the heading brings its own type and spacing. */
  sectionHeading: { gridColumn: "1 / -1" },
});
