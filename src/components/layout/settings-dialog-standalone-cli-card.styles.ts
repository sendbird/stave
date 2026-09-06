import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Standalone CLI folder field row inside its settings card. */
export const standaloneCliCardStyles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  input: {
    backgroundColor: vars.colorCanvas,
    height: vars.controlHeightLg,
  },
  browse: {
    flexShrink: 0,
    gap: vars.space8,
    height: vars.controlHeightLg,
  },
  browseIcon: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
  error: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    marginBlockStart: vars.space8,
  },
});
