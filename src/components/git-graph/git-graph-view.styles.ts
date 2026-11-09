import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";
import { localStack } from "@/lib/ui-layers.stylex";

/**
 * The view host sits on the Monaco editor surface (`--editor*`), so those
 * grounds stay as theme CSS variables; borders, muted/danger text, and the
 * resize accent resolve to AUI tokens.
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
    gap: vars["--aui-space-8"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--aui-color-danger"]} 25%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-danger"]} 8%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-danger-text"],
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
    color: vars["--aui-color-danger-text"],
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
    gap: vars["--aui-space-8"],
    color: vars["--aui-color-text-muted"],
  },
  loadingText: {
    fontSize: vars["--aui-font-size-caption"],
  },
  emptyState: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: vars["--aui-space-24"],
  },
  emptyInner: {
    display: "flex",
    maxWidth: "24rem",
    flexDirection: "column",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    textAlign: "center",
  },
  emptyIcon: {
    width: 32,
    height: 32,
    color: vars["--aui-color-text-muted"],
  },
  emptyTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  emptyBody: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: vars["--aui-color-text-muted"],
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
    zIndex: localStack["--stave-stack-raised"],
    flexShrink: 0,
    touchAction: "none",
    transitionProperty: "background-color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-border"]} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--aui-color-accent"]} 45%, transparent)`,
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
    bottom: vars["--aui-space-12"],
    right: vars["--aui-space-12"],
    zIndex: localStack["--stave-stack-floating"],
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: vars["--aui-color-surface-raised"],
    paddingInline: 10,
    paddingBlock: 6,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
    boxShadow: vars["--aui-elevation-lift"],
  },
});
