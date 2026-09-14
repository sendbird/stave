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
    gap: vars["--ads-space-12"],
    overflowX: "auto",
    paddingBlock: vars["--ads-space-4"],
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
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    color: vars["--ads-color-text"],
    cursor: {
      default: "grab",
      ":active": "grabbing",
    },
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    position: "relative",
    touchAction: "none",
  },
  cardLifted: {
    borderColor: vars["--ads-color-border-strong"],
    boxShadow: vars["--ads-elevation-lift"],
    // layer-ok: raises the dragged card over sibling cards in its own column
    zIndex: 1,
  },
  column: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-flat"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    inlineSize: "17rem",
    padding: vars["--ads-space-8"],
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
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
  },
  columnBody: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--ads-space-8"],
    minBlockSize: 0,
  },
  columnCount: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-4"],
    textAlign: "center",
  },
  columnHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-4"],
  },
  columnTitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  dropZone: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-16"],
    textAlign: "center",
  },
  emptyState: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-16"],
    textAlign: "center",
  },
});
