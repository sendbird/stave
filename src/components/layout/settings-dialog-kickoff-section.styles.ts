import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const kickoffSectionStyles = stylex.create({
  accessoryRow: {
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  sourceList: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  sourceItem: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  sourceHeader: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  sourceTrigger: {
    display: "flex",
    minInlineSize: 0,
    flex: 1,
    alignItems: "center",
    gap: vars["--ads-space-8"],
    textAlign: "left",
    background: "none",
    border: "none",
    padding: 0,
    color: "inherit",
    font: "inherit",
    cursor: "default",
  },
  chevron: {
    inlineSize: vars["--ads-control-icon-size-sm"],
    blockSize: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
  },
  triggerBody: {
    minInlineSize: 0,
    flex: 1,
  },
  triggerLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  triggerSummary: {
    marginBlockStart: vars["--ads-space-2"],
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  moveButtons: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
  },
  moveIcon: {
    inlineSize: vars["--ads-control-icon-size-sm"],
    blockSize: vars["--ads-control-icon-size-sm"],
  },
  serverBadges: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: vars["--ads-space-4"],
  },
  sourcePanel: {
    display: "grid",
    gap: vars["--ads-space-16"],
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
  },
  fieldGrid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  labelField: {
    display: "grid",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  labelFieldBlock: {
    display: "block",
    gridColumn: "1 / -1",
    marginBlock: 0,
  },
  selectTrigger: {
    inlineSize: "100%",
    backgroundColor: vars["--ads-color-canvas"],
  },
  monoInput: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  resolutionHint: {
    minBlockSize: 80,
  },
  removeRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  actionIcon: {
    inlineSize: vars["--ads-control-icon-size-sm"],
    blockSize: vars["--ads-control-icon-size-sm"],
  },
  actionIconSpinning: {
    inlineSize: vars["--ads-control-icon-size-sm"],
    blockSize: vars["--ads-control-icon-size-sm"],
    animationName: spin,
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  emptyNote: {
    marginBlock: 0,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--ads-color-border"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    paddingBlockStart: vars["--ads-space-12"],
  },
  footerNote: {
    marginBlock: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  modelSelector: {
    inlineSize: "100%",
  },
  modelSelectorTrigger: {
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: "100%",
    maxInlineSize: "none",
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    paddingInline: vars["--ads-space-12"],
  },
  promptField: {
    display: "grid",
    gap: vars["--ads-space-8"],
  },
  promptTextarea: {
    minBlockSize: 224,
    backgroundColor: vars["--ads-color-canvas"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
  promptFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  promptStatus: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  resetButton: {
    blockSize: vars["--ads-control-height-xs"],
    fontSize: vars["--ads-font-size-caption"],
  },
});
