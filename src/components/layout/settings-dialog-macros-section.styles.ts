import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Macros settings list, rows, and editor wrappers. */
export const macrosSectionStyles = stylex.create({
  addButton: {
    gap: vars["--aui-space-8"],
  },
  addIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  editorWrap: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-16"],
  },
  editorWrapInline: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    marginBlockStart: vars["--aui-space-12"],
    padding: vars["--aui-space-16"],
  },
  empty: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-16"],
  },
  list: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  row: {
    borderTopColor: {
      default: vars["--aui-color-border"],
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": 0,
    },
    padding: vars["--aui-space-12"],
  },
  rowMain: {
    alignItems: "start",
    display: "flex",
    gap: vars["--aui-space-12"],
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-overlay-hover"],
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--aui-control-height-sm"],
    justifyContent: "center",
    position: "relative",
    inlineSize: vars["--aui-space-32"],
  },
  markIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  rowBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  rowLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  slugCode: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
    lineHeight: vars["--aui-line-height-tight"],
    paddingBlock: vars["--aui-space-2"],
    paddingInline: vars["--aui-space-8"],
  },
  instantBadge: {
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-medium"],
    blockSize: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-8"],
  },
  rowMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
  },
  actionIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  deleteButton: {
    color: {
      default: vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
});
