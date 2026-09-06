import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * `--editor*` are the Monaco theme surfaces the commit graph sits on, so the
 * canvas keeps them as its ground rather than an ADS canvas token. Everything
 * else (borders, muted text, focus ring, elevation) resolves to ADS tokens.
 */
export const gitGraphCanvasStyles = stylex.create({
  svg: {
    pointerEvents: "none",
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 2,
    overflow: "visible",
  },
  root: {
    display: "flex",
    minHeight: 0,
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    backgroundColor: "var(--editor)",
  },
  headerBar: {
    height: 32,
    flexShrink: 0,
    overflow: "hidden",
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 65%, transparent)`,
    backgroundColor:
      "color-mix(in oklch, var(--editor-muted) 45%, transparent)",
  },
  headerRow: {
    display: "grid",
    height: "100%",
    alignItems: "center",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: vars.colorTextMuted,
  },
  headerCellLead: {
    paddingInline: vars.space12,
  },
  headerCell: {
    position: "relative",
    height: "100%",
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars.colorBorder} 40%, transparent)`,
    paddingInline: 10,
    paddingBlock: vars.space8,
  },
  resizeHandle: {
    position: "absolute",
    left: -4,
    top: 0,
    height: "100%",
    width: vars.space8,
    cursor: "col-resize",
    touchAction: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars.colorAccent} 30%, transparent)`,
    },
  },
  scroller: {
    position: "relative",
    minHeight: 0,
    flex: 1,
    overflow: "auto",
  },
  canvas: {
    position: "relative",
    width: "100%",
  },
  rowSlot: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  loadingMore: {
    position: "sticky",
    bottom: vars.space8,
    marginLeft: "auto",
    marginRight: vars.space8,
    display: "flex",
    width: "max-content",
    alignItems: "center",
    gap: 6,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorSurfaceRaised} 95%, transparent)`,
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
    boxShadow: vars.elevationRaised,
  },
});
