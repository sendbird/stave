import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Styles for the dev-only collaboration component preview root. */
export const collaborationPreviewStyles = stylex.create({
  page: {
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
    minHeight: "100vh",
    padding: vars["--ads-space-12"],
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginInline: "auto",
    maxWidth: "48rem",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  caption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  inspectorHost: {
    height: 720,
    minHeight: 0,
  },
});
