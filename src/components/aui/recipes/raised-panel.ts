import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Static panel and row recipe (#809 · R0 S3/S6/S12).
 *
 * A static panel rests on the tray as a raised surface: the translucent
 * `colorRing` hairline plus the `elevationRaised` contact shadow, on
 * `radiusPanel`, instead of an opaque 1px border. Inside it, rows follow the
 * row grammar — label and description at the start, value or control at the
 * end, hairlines between rows — on the 13px interface row role. A bounded
 * object (a run card) lifts instead (`elevationLift`, see `RunMonitor`).
 */
export const raisedPanel = stylex.create({
  panel: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    boxSizing: "border-box",
    minInlineSize: 0,
  },
  /** Rows inside a panel: hairlines between them, none above the first. */
  row: {
    alignItems: "center",
    borderBlockStartColor: {
      default: vars["--aui-color-border-subtle"],
      ":first-child": "transparent",
    },
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-12"],
    display: "flex",
    fontSize: vars["--aui-font-size-row"],
    lineHeight: vars["--aui-line-height-control"],
    minBlockSize: vars["--aui-control-height-sm"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  rowLabel: {
    color: vars["--aui-color-text"],
    flex: "1 1 auto",
    minInlineSize: 0,
  },
  /** Secondary line or value: muted ink, caption tier. */
  rowMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  /** Non-load-bearing marks only (a separator, a decorative count). */
  faint: {
    color: vars["--aui-color-text-faint"],
  },
  /** The 15/500 title of a section that sits inside a surface. */
  sectionTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-section"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
  },
});
