import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const refContextMenuStyles = stylex.create({
  dialogNarrow: {
    maxWidth: "24rem",
  },
  destructiveHeader: {
    marginBottom: vars["--ads-space-4"],
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    color: vars["--ads-color-danger-text"],
  },
  destructiveIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  destructiveTitle: {
    color: vars["--ads-color-danger-text"],
  },
  forceToggle: {
    display: "flex",
    cursor: "pointer",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 30%, transparent)`,
    },
  },
  forceLabelActive: {
    color: vars["--ads-color-danger-text"],
  },
  forceLabelMuted: {
    color: vars["--ads-color-text-muted"],
  },
  menu: {
    width: "15rem",
  },
  menuLabel: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  warningLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    whiteSpace: "normal",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    lineHeight: "16px",
    color: vars["--ads-color-warning-text"],
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
