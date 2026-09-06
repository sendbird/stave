import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Styles for the dev-only collaboration component preview root. */
export const collaborationPreviewStyles = stylex.create({
  page: {
    backgroundColor: vars.colorCanvas,
    color: vars.colorText,
    minHeight: "100vh",
    padding: vars.space12,
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    marginInline: "auto",
    maxWidth: "48rem",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  caption: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  inspectorHost: {
    height: 720,
    minHeight: 0,
  },
});
