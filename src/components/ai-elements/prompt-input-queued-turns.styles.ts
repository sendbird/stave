import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const rowActionsOpacity = "--queued-row-actions-opacity";

export const queuedTurnsStyles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: vars.colorSurface,
    paddingInline: vars.space12,
    paddingBlock: 10,
    // Popup band: this panel floats over the composer, so it takes the ADS
    // overlay step rather than a hand-mixed pair. The literal it replaced was
    // pure-black and theme-blind — invisible on a dark canvas, where
    // `elevationOverlay` is overridden per theme — and it had no ambient layer,
    // so the surface read as a card on the composer instead of above it.
    boxShadow: vars.elevationOverlay,
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  badge: {
    height: 20,
    paddingInline: 6,
    fontSize: vars.fontSizeMicro,
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeCount: {
    height: 20,
    paddingInline: 6,
    fontSize: vars.fontSizeMicro,
  },
  caption: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  clearButton: {
    marginLeft: "auto",
    height: 28,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    position: "relative",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: {
      default: `color-mix(in oklch, ${vars.colorBorder} 50%, transparent)`,
      ":hover": vars.colorBorder,
    },
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 80%, transparent)`,
    paddingInline: 10,
    paddingBlock: vars.space8,
    boxShadow: { default: vars.elevationRaised, ":hover": vars.elevationLift },
    transitionProperty: "border-color, box-shadow",
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
    [rowActionsOpacity]: { default: 0, ":hover": 1, ":focus-within": 1 },
  },
  rowFirst: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 30%, transparent)`,
  },
  editArea: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  editTextarea: {
    minHeight: 80,
    resize: "vertical",
    fontSize: vars.fontSizeBody,
  },
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars.space8,
  },
  rowBody: {
    display: "flex",
    minWidth: 0,
    alignItems: "flex-start",
    gap: vars.space8,
  },
  indexBadge: {
    marginTop: vars.space2,
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars.radiusFull,
    backgroundColor: vars.colorSurfaceTint,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted,
  },
  rowContent: {
    minWidth: 0,
    flex: 1,
  },
  summary: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  dispatch: {
    marginTop: vars.space2,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  dispatchWarning: { color: vars.colorWarningText },
  dispatchFirst: {
    color: `color-mix(in oklch, ${vars.colorAccent} 80%, transparent)`,
  },
  dispatchMuted: { color: vars.colorTextMuted },
  actions: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space2,
    opacity: `var(${rowActionsOpacity})`,
    transitionProperty: "opacity",
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
  },
  actionAccent: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorAccent },
  },
  actionDanger: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorDanger },
  },
  actionIcon: { width: "0.875rem", height: "0.875rem" },
});
