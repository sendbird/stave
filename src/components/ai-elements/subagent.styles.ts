import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

export const subagentStyles = stylex.create({
  root: {
    overflow: "hidden",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 25%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 5%, transparent)`,
  },
  header: {
    display: "flex",
    width: "100%",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.space12,
    paddingInline: vars.space12,
    paddingBlock: vars.space12,
    textAlign: "left",
  },
  headerBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  kindLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.875em",
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorText,
  },
  kindIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    color: vars.colorAccent,
  },
  title: {
    fontSize: "0.875em",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  promptSummary: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: "0.75em",
    lineHeight: "1.6",
    color: vars.colorTextMuted,
  },
  headerMeta: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space8,
  },
  chevron: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  chevronOpen: { transform: "rotate(180deg)" },

  progressSection: {
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars.colorAccent} 15%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  progressList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
  },
  progressItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.375rem",
    fontSize: "0.75em",
    color: vars.colorTextMuted,
  },
  progressDot: {
    marginTop: "0.375rem",
    width: "0.375rem",
    height: "0.375rem",
    flexShrink: 0,
    borderRadius: vars.radiusFull,
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 40%, transparent)`,
  },
  progressDotActive: {
    backgroundColor: vars.colorAccent,
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "2s",
    animationTimingFunction: "cubic-bezier(0.4, 0, 0.6, 1)",
    animationIterationCount: "infinite",
  },
  progressText: { minWidth: 0, wordBreak: "break-word" },

  detail: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars.colorAccent} 15%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 70%, transparent)`,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
});
