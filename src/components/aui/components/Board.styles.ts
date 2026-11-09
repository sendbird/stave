import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * `Board`'s styles, split into their own module so the board root, column, and
 * card modules share one source of surface, spacing, and drop-target rules.
 */
export const styles = stylex.create({
  board: {
    alignItems: "stretch",
    display: "flex",
    gap: vars["--aui-space-12"],
    overflowX: "auto",
    paddingBlock: vars["--aui-space-4"],
  },
  boardFillHeight: {
    // An intrinsic block size prevents flex/grid stretch from capping the
    // board at the viewport: tall card stacks can extend every column's
    // background, while the percentage minimum still fills sparse surfaces.
    blockSize: "max-content",
    flexGrow: 1,
    minBlockSize: "100%",
  },
  card: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    color: vars["--aui-color-text"],
    cursor: {
      default: "grab",
      ":active": "grabbing",
    },
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    position: "relative",
    touchAction: "none",
  },
  cardLifted: {
    borderColor: vars["--aui-color-border-strong"],
    boxShadow: vars["--aui-elevation-lift"],
    // layer-ok: raises the dragged card over sibling cards in its own column
    zIndex: 1,
  },
  column: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-flat"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    inlineSize: "17rem",
    padding: vars["--aui-space-8"],
  },
  columnActions: {
    display: "inline-flex",
    marginInlineStart: "auto",
  },
  // A drag DROP TARGET (`board?.hoverColumnId === id`), not a selection — so it
  // keeps the generic accent tint. §1.7's grammar table listed "Board column"
  // under selected rows; Board has no selected-column state, and that row of
  // the table has been corrected rather than this code changed to match it.
  columnActive: {
    backgroundColor: vars["--aui-color-accent-soft"],
    borderColor: vars["--aui-color-accent"],
  },
  columnBody: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--aui-space-8"],
    minBlockSize: 0,
  },
  columnCount: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-4"],
    textAlign: "center",
  },
  columnHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-4"],
  },
  columnTitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  dropZone: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-16"],
    textAlign: "center",
  },
  emptyState: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-16"],
    textAlign: "center",
  },
});
