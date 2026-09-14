import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const chatInputApprovalQueueStyles = stylex.create({
  section: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    marginBottom: vars["--ads-space-12"],
  },
  sectionCompact: {
    padding: vars["--ads-space-8"],
  },
  sectionRegular: {
    padding: "0.625rem",
  },
  status: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: "0.375rem",
    marginTop: "0.375rem",
    paddingInline: vars["--ads-space-4"],
  },
  linkAction: {
    borderRadius: vars["--ads-radius-mark"],
    color: {
      default: vars["--ads-color-text-subtle"],
      ":hover": vars["--ads-color-text-muted"],
    },
    fontSize: vars["--ads-font-size-micro"],
    marginTop: "0.375rem",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
    textAlign: "left",
  },
  guideAction: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    color: {
      default: vars["--ads-color-text-subtle"],
      ":hover": vars["--ads-color-text-muted"],
    },
    display: "flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
    marginTop: "0.375rem",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
  },
  guideKbd: {
    fontSize: vars["--ads-font-size-micro"],
    height: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-4"],
  },
  guidancePanel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-2"],
  },
  guidanceField: {
    backgroundColor: vars["--ads-color-canvas"],
    fontSize: vars["--ads-font-size-caption"],
    minHeight: 0,
    resize: "none",
  },
  guidanceActions: {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
  },
  compactButton: {
    fontSize: vars["--ads-font-size-caption"],
    height: 28,
    paddingInline: "0.625rem",
  },
  compactButtonQuiet: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    height: 28,
    paddingInline: vars["--ads-space-8"],
  },
  queuedGroup: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    marginTop: vars["--ads-space-8"],
    paddingTop: vars["--ads-space-8"],
  },
  queuedSummary: {
    color: {
      default: vars["--ads-color-text-subtle"],
      ":hover": vars["--ads-color-text-muted"],
    },
    cursor: "pointer",
    fontSize: vars["--ads-font-size-micro"],
    userSelect: "none",
  },
  queuedList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: "0.375rem",
  },
});
