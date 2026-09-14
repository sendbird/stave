import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const lensApprovalStyles = stylex.create({
  /** Wider than the default dialog once there is room for the fact rows. */
  content: {
    maxWidth: {
      default: "28rem",
      "@media (min-width: 640px)": "32rem",
    },
  },
  header: { gap: vars["--ads-space-12"] },
  headerRow: { alignItems: "flex-start", display: "flex", gap: vars["--ads-space-12"] },
  headerBadge: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    blockSize: 40,
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    inlineSize: 40,
    justifyContent: "center",
  },
  headerIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  headerText: { minInlineSize: 0 },
  description: { marginBlockStart: vars["--ads-space-4"] },
  body: { display: "grid", fontSize: vars["--ads-font-size-body"], gap: vars["--ads-space-8"] },
  fact: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  factLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  factValue: { fontSize: vars["--ads-font-size-caption"] },
  factValueTruncated: {
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  factValueMono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  hint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    margin: 0,
  },
});
