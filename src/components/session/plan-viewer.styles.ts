import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The plan/todo floater card width when minimized or dragged (was `w-72`).
 */
const FLOATER_MINIMIZED_WIDTH = "18rem";

export const planViewerStyles = stylex.create({
  /**
   * Outer floating wrapper. Clicks fall through until an inner card opts back
   * in via `cardBase`'s `pointerEvents: "auto"`. Composed with the shared
   * session-floater layer class by its consumers.
   */
  floatingWrapper: {
    pointerEvents: "none",
    position: "absolute",
  },
  cardBase: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationOverlay,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "auto",
  },
  cardExpanded: {
    height: "100%",
    width: "100%",
  },
  cardMinimized: {
    width: FLOATER_MINIMIZED_WIDTH,
  },
});


export const planViewerElementStyles = stylex.create({
  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    paddingBlock: "0.625rem",
    paddingInline: vars.space16,
  },
  dragHandle: {
    alignItems: "center",
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    gap: vars.space8,
    minWidth: 0,
    overflow: "hidden",
    userSelect: "none",
  },
  dragHandleGrab: {
    cursor: "grab",
  },
  headerIcon: {
    color: vars.colorAccent,
    flexShrink: 0,
  },
  headerTitle: {
    flexGrow: 1,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerButton: {
    borderRadius: vars.radiusMark,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    padding: vars.space2,
  },
  body: {
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  bodyExpanded: {
    flexGrow: 1,
  },
  bodyNormal: {
    maxHeight: "18rem",
  },
  reviseRegion: {
    flexShrink: 0,
    padding: vars.space12,
  },
  revisionField: {
    backgroundColor: vars.colorCanvas,
    fontSize: vars.fontSizeLead,
    lineHeight: vars.lineHeightRelaxed,
    minHeight: 72,
  },
  reviseActions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    marginTop: vars.space8,
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars.space8,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  notice: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    margin: 0,
  },
});
