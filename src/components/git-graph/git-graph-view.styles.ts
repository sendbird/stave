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
    gap: vars.space8,
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorDanger} 25%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorDanger} 8%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: vars.colorDangerText,
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
    color: vars.colorDangerText,
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
    gap: vars.space8,
    color: vars.colorTextMuted,
  },
  loadingText: {
    fontSize: vars.fontSizeCaption,
  },
  emptyState: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: vars.space24,
  },
  emptyInner: {
    display: "flex",
    maxWidth: "24rem",
    flexDirection: "column",
    alignItems: "center",
    gap: vars.space8,
    textAlign: "center",
  },
  emptyIcon: {
    width: 32,
    height: 32,
    color: `color-mix(in oklch, ${vars.colorTextMuted} 45%, transparent)`,
  },
  emptyTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  emptyBody: {
    fontSize: vars.fontSizeCaption,
    lineHeight: "20px",
    color: vars.colorTextMuted,
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
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars.colorBorder} 65%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars.colorAccent} 45%, transparent)`,
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
    bottom: vars.space12,
    right: vars.space12,
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: vars.colorSurfaceRaised,
    paddingInline: 10,
    paddingBlock: 6,
    fontSize: vars.fontSizeMicro,
    color: vars.colorText,
    boxShadow: vars.elevationLift,
  },
});
