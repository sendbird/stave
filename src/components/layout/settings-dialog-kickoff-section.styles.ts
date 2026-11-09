import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const kickoffSectionStyles = stylex.create({
  accessoryRow: {
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  sourceList: {
    display: "grid",
    gap: vars["--aui-space-8"],
  },
  sourceItem: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  sourceHeader: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  sourceTrigger: {
    display: "flex",
    minInlineSize: 0,
    flex: 1,
    alignItems: "center",
    gap: vars["--aui-space-8"],
    textAlign: "left",
    background: "none",
    border: "none",
    padding: 0,
    color: "inherit",
    font: "inherit",
    cursor: "default",
  },
  chevron: {
    inlineSize: vars["--aui-control-icon-size-sm"],
    blockSize: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  triggerBody: {
    minInlineSize: 0,
    flex: 1,
  },
  triggerLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  triggerSummary: {
    marginBlockStart: vars["--aui-space-2"],
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  moveButtons: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
  },
  moveIcon: {
    inlineSize: vars["--aui-control-icon-size-sm"],
    blockSize: vars["--aui-control-icon-size-sm"],
  },
  serverBadges: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: vars["--aui-space-4"],
  },
  sourcePanel: {
    display: "grid",
    gap: vars["--aui-space-16"],
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
  },
  fieldGrid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  labelField: {
    display: "grid",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  labelFieldBlock: {
    display: "block",
    gridColumn: "1 / -1",
    marginBlock: 0,
  },
  selectTrigger: {
    inlineSize: "100%",
    backgroundColor: vars["--aui-color-canvas"],
  },
  monoInput: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  resolutionHint: {
    minBlockSize: 80,
  },
  removeRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  actionIcon: {
    inlineSize: vars["--aui-control-icon-size-sm"],
    blockSize: vars["--aui-control-icon-size-sm"],
  },
  actionIconSpinning: {
    inlineSize: vars["--aui-control-icon-size-sm"],
    blockSize: vars["--aui-control-icon-size-sm"],
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
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--aui-color-border"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-16"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    paddingBlockStart: vars["--aui-space-12"],
  },
  footerNote: {
    marginBlock: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  modelSelector: {
    inlineSize: "100%",
  },
  modelSelectorTrigger: {
    blockSize: vars["--aui-control-height-lg"],
    inlineSize: "100%",
    maxInlineSize: "none",
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: {
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-overlay-hover"],
    },
    paddingInline: vars["--aui-space-12"],
  },
  promptField: {
    display: "grid",
    gap: vars["--aui-space-8"],
  },
  promptTextarea: {
    minBlockSize: 224,
    backgroundColor: vars["--aui-color-canvas"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
  },
  promptFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  promptStatus: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  resetButton: {
    blockSize: vars["--aui-control-height-xs"],
    fontSize: vars["--aui-font-size-caption"],
  },
});
