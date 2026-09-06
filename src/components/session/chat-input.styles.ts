import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const pulseKeyframes = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.5 },
  "100%": { opacity: 1 },
});

export const chatInputStyles = stylex.create({
  root: {
    backgroundColor: vars.colorCanvas,
    paddingBlock: "0.625rem",
    paddingInline: {
      default: vars.space12,
      "@media (min-width: 640px)": vars.space16,
    },
  },
  rootEmpty: {
    paddingBottom: vars.space24,
  },
  measure: {
    marginInline: "auto",
    maxWidth: 1152,
  },
  steerRow: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: "0.375rem",
    marginBottom: vars.space8,
    paddingInline: vars.space4,
  },
  steerDot: {
    animationDuration: {
      default: vars.motionDurationLoop,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationIterationCount: "infinite",
    animationName: {
      default: pulseKeyframes,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    height: 6,
    width: 6,
  },
  stalledBanner: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginBottom: vars.space12,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  stalledInner: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  stalledBadge: {
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  menuLabelRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  menuLabelRecent: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space8,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  menuItemStart: {
    alignItems: "flex-start",
    gap: vars.space8,
  },
  menuItemGap: {
    gap: vars.space8,
  },
  itemText: {
    flexGrow: 1,
    minWidth: 0,
  },
  itemTitle: {
    display: "block",
    fontSize: vars.fontSizeBody,
  },
  itemTitleTruncate: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
  itemDescription: {
    color: vars.colorTextMuted,
    display: "block",
    fontSize: vars.fontSizeCaption,
  },
  itemDescriptionCapitalize: {
    color: vars.colorTextMuted,
    display: "block",
    fontSize: vars.fontSizeCaption,
    textTransform: "capitalize",
  },
  runDot: {
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 6,
    marginTop: vars.space4,
    width: 6,
  },
  compareControlGroup: {
    alignItems: "stretch",
    display: "inline-flex",
    gap: vars.space2,
  },
  compareControlMenuTrigger: {
    paddingInline: vars.space4,
  },
  tooltipContent: {
    maxWidth: 288,
  },
  menuContentWide: {
    width: 320,
  },
});
