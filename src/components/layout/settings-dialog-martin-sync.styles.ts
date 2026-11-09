import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const martinSyncStyles = stylex.create({
  scopeBadge: {
    textTransform: "capitalize",
  },
  panel: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  panelHeader: {
    alignItems: "start",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-20"],
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--aui-control-height-md"],
    justifyContent: "center",
    inlineSize: vars["--aui-control-height-md"],
  },
  headerMarkIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  headerBody: {
    flex: 1,
    minInlineSize: 0,
  },
  headerTitleLine: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: vars["--aui-space-8"],
  },
  headerTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  headerDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    marginBlockStart: vars["--aui-space-4"],
  },
  refreshIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  refreshIconSpinning: {
    animationDuration: vars["--aui-motion-duration-loop"],
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
    gap: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-20"],
  },
  sectionTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  sectionDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    marginBlockStart: vars["--aui-space-4"],
  },
  fieldGrid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  field: {
    display: "grid",
    gap: vars["--aui-space-8"],
  },
  fieldLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  scopeLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  pairRow: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars["--aui-space-12"],
  },
  pairInput: {
    "@media (min-width: 640px)": {
      maxInlineSize: "24rem",
    },
  },
  pairIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  warning: {
    backgroundColor: vars["--aui-color-danger-soft"],
    borderColor: vars["--aui-color-danger-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  scopeWarning: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  toggles: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-20"],
    paddingBlockStart: vars["--aui-space-20"],
  },
  outbox: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
    rowGap: vars["--aui-space-12"],
  },
  outboxIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  outboxText: {
    color: vars["--aui-color-text-muted"],
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    minInlineSize: 0,
  },
  outboxStrong: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  retryIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
});
