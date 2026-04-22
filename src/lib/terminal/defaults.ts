/**
 * Prefer a system monospace stack for terminal surfaces so provider-specific
 * glyphs like Claude's prompt marker render cleanly across both xterm and
 * ghostty-backed surfaces.
 */
export const LEGACY_TERMINAL_FONT_FAMILY = "JetBrains Mono";

export const DEFAULT_TERMINAL_FONT_FAMILY = [
  'ui-monospace',
  '"SF Mono"',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  '"Liberation Mono"',
  '"DejaVu Sans Mono"',
  'monospace',
].join(", ");

export const DEFAULT_TERMINAL_FONT_SIZE = 13;
