import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Macros settings list, rows, and editor wrappers. */
export const macrosSectionStyles = stylex.create({
  addButton: {
    gap: vars["--ads-space-8"],
  },
  addIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  editorWrap: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-16"],
  },
  editorWrapInline: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    marginBlockStart: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
  },
  empty: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-16"],
  },
  list: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  row: {
    borderTopColor: {
      default: vars["--ads-color-border"],
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": 0,
    },
    padding: vars["--ads-space-12"],
  },
  rowMain: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-12"],
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-overlay-hover"],
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--ads-control-height-sm"],
    justifyContent: "center",
    position: "relative",
    inlineSize: vars["--ads-space-32"],
  },
  markIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  rowBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  rowLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  slugCode: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-8"],
  },
  instantBadge: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    blockSize: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-8"],
  },
  rowMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-2"],
  },
  actionIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  deleteButton: {
    color: {
      default: vars["--ads-color-danger-text"],
      ":hover": vars["--ads-color-danger-text"],
    },
  },
});
