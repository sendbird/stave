import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Empty-project welcome screen shown before a workspace is opened. */
export const workspaceWelcomeStyles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas"],
    display: "flex",
    inset: 0,
    justifyContent: "center",
    overflow: "auto",
    padding: vars["--ads-space-24"],
    position: "absolute",
    zIndex: vars["--ads-z-index-panel"],
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    marginBlock: "auto",
    maxWidth: "36rem",
    width: "100%",
  },
  intro: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  eyebrow: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-title"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.02em",
    lineHeight: vars["--ads-line-height-title"],
  },
  lede: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  action: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  actionIcon: { height: 16, width: 16 },
  actionHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  steps: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-16"],
    lineHeight: vars["--ads-line-height-relaxed"],
    listStyleType: "none",
    marginBlock: 0,
    paddingBlockStart: vars["--ads-space-20"],
    paddingInline: 0,
  },
  stepLead: { color: vars["--ads-color-text"] },
});
