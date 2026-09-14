import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The view host sits on the Monaco editor surface (`--editor*`), so those
 * grounds stay as theme CSS variables; borders, muted/danger text, and the
 * resize accent resolve to ADS tokens.
 */
export const gitGraphViewStyles = stylex.create({
  root: {
    position: "relative",
    display: "flex",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: "var(--editor)",
    color: "var(--editor-foreground)",
  },
  errorBar: {
    display: "flex",
    flexShrink: 0,
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-danger"]} 25%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-danger"]} 8%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
  errorIcon: {
    marginTop: 2,
    width: 14,
    height: 14,
    flexShrink: 0,
  },
  errorText: {
    minWidth: 0,
    flex: 1,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  },
  errorDismiss: {
    width: 20,
    height: 20,
    color: vars["--ads-color-danger-text"],
  },
  errorDismissIcon: {
    width: 12,
    height: 12,
  },
  loadingState: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingInner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    color: vars["--ads-color-text-muted"],
  },
  loadingText: {
    fontSize: vars["--ads-font-size-caption"],
  },
  emptyState: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: vars["--ads-space-24"],
  },
  emptyInner: {
    display: "flex",
    maxWidth: "24rem",
    flexDirection: "column",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    textAlign: "center",
  },
  emptyIcon: {
    width: 32,
    height: 32,
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 45%, transparent)`,
  },
  emptyTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  emptyBody: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: vars["--ads-color-text-muted"],
  },
  splitArea: {
    display: "flex",
    minHeight: 0,
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
  },
  splitAreaColumn: {
    flexDirection: "column",
  },
  resizer: {
    zIndex: 10,
    flexShrink: 0,
    touchAction: "none",
    transitionProperty: "background-color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-border"]} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent"]} 45%, transparent)`,
    },
  },
  resizerVertical: {
    width: 4,
    cursor: "col-resize",
  },
  resizerHorizontal: {
    height: 4,
    cursor: "row-resize",
  },
  detailPane: {
    minHeight: 0,
    minWidth: 0,
    flexShrink: 0,
    overflow: "hidden",
  },
  pendingToast: {
    pointerEvents: "none",
    position: "absolute",
    bottom: vars["--ads-space-12"],
    right: vars["--ads-space-12"],
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: vars["--ads-color-surface-raised"],
    paddingInline: 10,
    paddingBlock: 6,
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text"],
    boxShadow: vars["--ads-elevation-lift"],
  },
});
