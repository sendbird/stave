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
    gap: vars.space12,
    overflowX: "auto",
    paddingBlock: vars.space4,
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
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    color: vars.colorText,
    cursor: {
      default: "grab",
      ":active": "grabbing",
    },
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    position: "relative",
    touchAction: "none",
  },
  cardLifted: {
    borderColor: vars.colorBorderStrong,
    boxShadow: vars.elevationLift,
    // layer-ok: raises the dragged card over sibling cards in its own column
    zIndex: 1,
  },
  column: {
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationFlat,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    inlineSize: "17rem",
    padding: vars.space8,
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
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
  },
  columnBody: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars.space8,
    minBlockSize: 0,
  },
  columnCount: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
    minInlineSize: vars.space20,
    paddingInline: vars.space4,
    textAlign: "center",
  },
  columnHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    paddingBlock: vars.space4,
    paddingInline: vars.space4,
  },
  columnTitle: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  dropZone: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    paddingBlock: vars.space16,
    textAlign: "center",
  },
  emptyState: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    paddingBlock: vars.space16,
    textAlign: "center",
  },
});
