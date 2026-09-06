import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const enterKeyframes = stylex.keyframes({
  from: {
    opacity: 0,
    transform: "translateY(0.5rem)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

export const todoFloaterStyles = stylex.create({
  wrapper: {
    transitionDuration: "300ms",
    transitionProperty: "opacity",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  wrapperLingering: {
    opacity: 0.5,
  },
  wrapperVisible: {
    animationName: {
      default: enterKeyframes,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: {
      default: vars.motionDurationNormal,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationTimingFunction: vars.motionEaseStandard,
    opacity: 1,
  },
  card: {
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
  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
  },
  headerIcon: {
    color: vars.colorAccent,
    flexShrink: 0,
  },
  headerTitle: {
    flexGrow: 1,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerCount: {
    color: vars.colorTextMuted,
    fontSize: "0.8125rem",
    fontVariantNumeric: "tabular-nums",
  },
  progressTrack: {
    backgroundColor: vars.colorBorder,
    height: 2,
    width: "100%",
  },
  progressBar: {
    height: "100%",
    transitionDuration: "300ms",
    transitionProperty: "width",
    transitionTimingFunction: "ease-out",
  },
  progressBarActive: {
    backgroundColor: vars.colorAccent,
  },
  progressBarComplete: {
    backgroundColor: vars.colorSuccess,
  },
  items: {
    maxHeight: "15rem",
    overflowY: "auto",
    paddingBlock: vars.space12,
    paddingInline: "0.875rem",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  item: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.625rem",
  },
  itemLabel: {
    fontSize: vars.fontSizeBody,
    lineHeight: 1.55,
  },
  itemLabelCompleted: {
    color: vars.colorTextMuted,
    textDecorationLine: "line-through",
  },
  itemLabelInProgress: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  itemLabelPending: {
    color: vars.colorTextMuted,
  },
  statusIcon: {
    flexShrink: 0,
    marginTop: "0.1875rem",
  },
  statusIconCompleted: {
    color: vars.colorSuccess,
  },
  statusIconPending: {
    color: vars.colorTextSubtle,
  },
  statusLoader: {
    color: vars.colorAccent,
    marginTop: "0.1875rem",
  },
});
