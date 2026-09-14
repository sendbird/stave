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
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 65%, transparent)`,
    backgroundColor:
      "color-mix(in oklch, var(--editor-muted) 45%, transparent)",
  },
  headerRow: {
    display: "grid",
    height: "100%",
    alignItems: "center",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: vars["--ads-color-text-muted"],
  },
  headerCellLead: {
    paddingInline: vars["--ads-space-12"],
  },
  headerCell: {
    position: "relative",
    height: "100%",
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 40%, transparent)`,
    paddingInline: 10,
    paddingBlock: vars["--ads-space-8"],
  },
  resizeHandle: {
    position: "absolute",
    left: -4,
    top: 0,
    height: "100%",
    width: vars["--ads-space-8"],
    cursor: "col-resize",
    touchAction: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent"]} 30%, transparent)`,
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
    bottom: vars["--ads-space-8"],
    marginLeft: "auto",
    marginRight: vars["--ads-space-8"],
    display: "flex",
    width: "max-content",
    alignItems: "center",
    gap: 6,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-raised"]} 95%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
    boxShadow: vars["--ads-elevation-raised"],
  },
});
