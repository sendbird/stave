/**
 * Prefer a system monospace stack for terminal surfaces so provider-specific
 * glyphs like Claude's prompt marker render cleanly across the dock and CLI
 * terminal surfaces.
 */
export const LEGACY_TERMINAL_FONT_FAMILY = "JetBrains Mono";

export const DEFAULT_TERMINAL_FONT_FAMILY = [
  '"Symbols Nerd Font Mono"',
  '"Symbols Nerd Font"',
  '"JetBrainsMono Nerd Font Mono"',
  '"JetBrainsMono Nerd Font"',
  "ui-monospace",
  '"SF Mono"',
  "SFMono-Regular",
  "Menlo",
  "Monaco",
  "Consolas",
  '"Liberation Mono"',
  '"DejaVu Sans Mono"',
  "monospace",
].join(", ");

export const DEFAULT_TERMINAL_FONT_SIZE = 13;

/**
 * Terminal cells render at their font's native weight.
 *
 * Do not drop this below 400. Every Latin family in the stack above ships a
 * single upright weight, so a lighter value looks like a no-op locally while
 * CJK text — which has no family in the stack and falls back to a system face
 * such as Apple SD Gothic Neo, which does ship a Light cut — renders with about
 * half the ink of the surrounding UI and of xterm's IME composition overlay.
 */
export const DEFAULT_TERMINAL_FONT_WEIGHT = 400;

/**
 * Bold terminal cells render at the font's real Bold cut.
 *
 * Do not drop this below 700. The Latin families in the stack ship only 400 and
 * 700, and CSS font matching resolves any request from 400 through 500 down to
 * the 400 face — so the previous value of 500 produced pixel-identical output to
 * a regular cell, making SGR 1 invisible for Latin text. 600 does reach the
 * Latin Bold face, but CJK fallbacks such as Apple SD Gothic Neo ship a full
 * weight range and would land on SemiBold, leaving CJK bold visibly lighter than
 * Latin bold. 700 puts both scripts on their family's Bold cut.
 */
export const DEFAULT_TERMINAL_FONT_WEIGHT_BOLD = 700;
