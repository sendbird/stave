import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const chatInputApprovalQueueStyles = stylex.create({
  section: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    marginBottom: vars.space12,
  },
  sectionCompact: {
    padding: vars.space8,
  },
  sectionRegular: {
    padding: "0.625rem",
  },
  status: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: "0.375rem",
    marginTop: "0.375rem",
    paddingInline: vars.space4,
  },
  linkAction: {
    borderRadius: vars.radiusMark,
    color: {
      default: vars.colorTextSubtle,
      ":hover": vars.colorTextMuted,
    },
    fontSize: vars.fontSizeMicro,
    marginTop: "0.375rem",
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
    textAlign: "left",
  },
  guideAction: {
    alignItems: "center",
    borderRadius: vars.radiusMark,
    color: {
      default: vars.colorTextSubtle,
      ":hover": vars.colorTextMuted,
    },
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
    marginTop: "0.375rem",
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
  },
  guideKbd: {
    fontSize: "0.625rem",
    height: vars.space16,
    paddingInline: vars.space4,
  },
  guidancePanel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: vars.space8,
    paddingInline: vars.space2,
  },
  guidanceField: {
    backgroundColor: vars.colorCanvas,
    fontSize: vars.fontSizeCaption,
    minHeight: 0,
    resize: "none",
  },
  guidanceActions: {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
  },
  compactButton: {
    fontSize: vars.fontSizeCaption,
    height: 28,
    paddingInline: "0.625rem",
  },
  compactButtonQuiet: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    height: 28,
    paddingInline: vars.space8,
  },
  queuedGroup: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    marginTop: vars.space8,
    paddingTop: vars.space8,
  },
  queuedSummary: {
    color: {
      default: vars.colorTextSubtle,
      ":hover": vars.colorTextMuted,
    },
    cursor: "pointer",
    fontSize: vars.fontSizeMicro,
    userSelect: "none",
  },
  queuedList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: "0.375rem",
  },
});
