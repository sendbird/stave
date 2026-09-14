import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

export const subagentStyles = stylex.create({
  root: {
    overflow: "hidden",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 25%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 5%, transparent)`,
  },
  header: {
    display: "flex",
    width: "100%",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    textAlign: "left",
  },
  headerBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  kindLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.875em",
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  kindIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-accent"],
  },
  title: {
    fontSize: "0.875em",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  promptSummary: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: "0.75em",
    lineHeight: "1.6",
    color: vars["--ads-color-text-muted"],
  },
  headerMeta: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  chevron: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  chevronOpen: { transform: "rotate(180deg)" },

  progressSection: {
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 15%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  progressList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
  },
  progressItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.375rem",
    fontSize: "0.75em",
    color: vars["--ads-color-text-muted"],
  },
  progressDot: {
    marginTop: "0.375rem",
    width: "0.375rem",
    height: "0.375rem",
    flexShrink: 0,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 40%, transparent)`,
  },
  progressDotActive: {
    backgroundColor: vars["--ads-color-accent"],
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
    gap: vars["--ads-space-8"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 15%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
});
