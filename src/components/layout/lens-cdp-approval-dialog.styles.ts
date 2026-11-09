import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const lensApprovalStyles = stylex.create({
  /** Wider than the default dialog once there is room for the fact rows. */
  content: {
    maxWidth: {
      default: "28rem",
      "@media (min-width: 640px)": "32rem",
    },
  },
  header: { gap: vars["--aui-space-12"] },
  headerRow: { alignItems: "flex-start", display: "flex", gap: vars["--aui-space-12"] },
  headerBadge: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    blockSize: 40,
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    inlineSize: 40,
    justifyContent: "center",
  },
  headerIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  headerText: { minInlineSize: 0 },
  description: { marginBlockStart: vars["--aui-space-4"] },
  body: { display: "grid", fontSize: vars["--aui-font-size-body"], gap: vars["--aui-space-8"] },
  fact: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  factLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  factValue: { fontSize: vars["--aui-font-size-caption"] },
  factValueTruncated: {
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  factValueMono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  hint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    margin: 0,
  },
});
