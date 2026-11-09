import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const refContextMenuStyles = stylex.create({
  dialogNarrow: {
    maxWidth: "24rem",
  },
  destructiveHeader: {
    marginBottom: vars["--aui-space-4"],
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    color: vars["--aui-color-danger-text"],
  },
  destructiveIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  destructiveTitle: {
    color: vars["--aui-color-danger-text"],
  },
  forceToggle: {
    display: "flex",
    cursor: "pointer",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas-subtle"]} 30%, transparent)`,
    },
  },
  forceLabelActive: {
    color: vars["--aui-color-danger-text"],
  },
  forceLabelMuted: {
    color: vars["--aui-color-text-muted"],
  },
  menu: {
    width: "15rem",
  },
  menuLabel: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  warningLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    whiteSpace: "normal",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    lineHeight: "16px",
    color: vars["--aui-color-warning-text"],
  },
  warningIcon: {
    marginTop: 2,
    width: 12,
    height: 12,
    flexShrink: 0,
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
});
