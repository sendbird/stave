import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const martinSyncStyles = stylex.create({
  // Runtime-state badge tones (replaces the Tailwind classes returned by
  // `runtimeBadgeClass`). Each restates the border, fill, and text hue.
  badgeReady: {
    backgroundColor: vars["--ads-color-success-soft"],
    borderColor: vars["--ads-color-success-border"],
    color: vars["--ads-color-success-text"],
  },
  badgeIdle: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    color: vars["--ads-color-warning-text"],
  },
  badgeAttention: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    color: vars["--ads-color-danger-text"],
  },
  scopeBadge: {
    textTransform: "capitalize",
  },
  panel: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  panelHeader: {
    alignItems: "start",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-20"],
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--ads-control-height-md"],
    justifyContent: "center",
    inlineSize: vars["--ads-control-height-md"],
  },
  headerMarkIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  headerBody: {
    flex: 1,
    minInlineSize: 0,
  },
  headerTitleLine: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: vars["--ads-space-8"],
  },
  headerTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  headerDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockStart: vars["--ads-space-4"],
  },
  refreshIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  refreshIconSpinning: {
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  panelBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-20"],
  },
  sectionTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sectionDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockStart: vars["--ads-space-4"],
  },
  fieldGrid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  field: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  fieldLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  scopeLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  pairRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--ads-space-12"],
  },
  pairInput: {
    "@media (min-width: 640px)": {
      maxInlineSize: "24rem",
    },
  },
  pairIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  warning: {
    backgroundColor: vars["--ads-color-danger-soft"],
    borderColor: vars["--ads-color-danger-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  scopeWarning: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  toggles: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    paddingBlockStart: vars["--ads-space-20"],
  },
  outbox: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    columnGap: vars["--ads-space-12"],
    display: "flex",
    flexWrap: "wrap",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
    rowGap: vars["--ads-space-12"],
  },
  outboxIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  outboxText: {
    color: vars["--ads-color-text-muted"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    minInlineSize: 0,
  },
  outboxStrong: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  retryIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
});
