import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The command surface's own styles. Every value is a token: the surface is a
 * rung-4 tint (`agentSurface.well`) that the row above it already earned, so
 * nothing here spends a perimeter, and the mono register comes from
 * `agentSurface.meta` rather than from a second font declaration.
 */
export const commandResultStyles = stylex.create({
  root: {
    gap: vars.space8,
    padding: vars.space8,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  glyph: {
    color: vars.colorTextSubtle,
    flexShrink: 0,
  },
  /**
   * The command line. `colorText`, not the muted machine ink: the command is
   * the one thing in this surface the reader came to read, and it is also the
   * thing they will copy.
   */
  command: {
    color: vars.colorText,
    flex: "1 1 auto",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copy: {
    flexShrink: 0,
  },
  /**
   * The output. `pre-wrap` keeps the process's own line breaks;
   * `overflow-wrap: anywhere` stops one long path from establishing a
   * min-content width wider than the disclosure holding it.
   */
  output: {
    color: vars.colorText,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontVariantLigatures: "none",
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  /**
   * The error tone comes from `isError` and nothing else. A normalized tool
   * result carries `output` and `isError`; it carries no exit code, so the
   * surface must not print one — an invented `exit 1` next to a real stderr
   * dump is worse than no number at all.
   */
  outputError: {
    color: vars.colorDangerText,
  },
  empty: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
  },
});
