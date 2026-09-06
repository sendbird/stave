import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Empty-project welcome screen shown before a workspace is opened. */
export const workspaceWelcomeStyles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    display: "flex",
    inset: 0,
    justifyContent: "center",
    overflow: "auto",
    padding: vars.space24,
    position: "absolute",
    zIndex: vars.zIndexPanel,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space24,
    marginBlock: "auto",
    maxWidth: "36rem",
    width: "100%",
  },
  intro: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  eyebrow: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeTitle,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.02em",
    lineHeight: vars.lineHeightTitle,
  },
  lede: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
  },
  action: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  actionIcon: { height: 16, width: 16 },
  actionHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  steps: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: vars.fontSizeBody,
    gap: vars.space16,
    lineHeight: vars.lineHeightRelaxed,
    listStyleType: "none",
    marginBlock: 0,
    paddingBlockStart: vars.space20,
    paddingInline: 0,
  },
  stepLead: { color: vars.colorText },
});
