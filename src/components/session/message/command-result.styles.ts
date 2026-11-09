import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The command surface's own styles. Every value is a token: the surface is a
 * rung-4 tint (`agentSurface.well`) that the row above it already earned, so
 * nothing here spends a perimeter, and the mono register comes from
 * `agentSurface.meta` rather than from a second font declaration.
 */
export const commandResultStyles = stylex.create({
  root: {
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-8"],
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  glyph: {
    color: vars["--aui-color-text-subtle"],
    flexShrink: 0,
  },
  /**
   * The command line. `colorText`, not the muted machine ink: the command is
   * the one thing in this surface the reader came to read, and it is also the
   * thing they will copy.
   */
  command: {
    color: vars["--aui-color-text"],
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
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantLigatures: "none",
    lineHeight: vars["--aui-line-height-normal"],
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
    color: vars["--aui-color-danger-text"],
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
});

/**
 * Command line token inks. All semantic text tokens, so every built-in and
 * custom theme colors them; danger keeps its weight too, so it still stands
 * out where a theme's red sits close to its body text.
 */
export const shellTokenStyles = stylex.create({
  command: { fontWeight: vars["--aui-font-weight-semibold"] },
  flag: { color: vars["--aui-color-info-text"] },
  string: { color: vars["--aui-color-success-text"] },
  variable: { color: vars["--aui-color-warning-text"] },
  operator: { color: vars["--aui-color-text-muted"] },
  comment: { color: vars["--aui-color-text-subtle"], fontStyle: "italic" },
  danger: {
    color: vars["--aui-color-danger-text"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  text: {},
});
