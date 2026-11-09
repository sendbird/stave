import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Release notes in Settings → Changelog: one accordion item per release, each
 * body drawn by the shared markdown preview.
 */
export const changelogSectionStyles = stylex.create({
  // The preview paints the editor ground and owns its scroll; inside a
  // settings card it sits on the card and grows with its content instead.
  preview: {
    backgroundColor: "transparent",
    height: "auto",
    overflow: "visible",
  },
  releaseTitle: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  releaseVersion: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  releaseDate: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
});
