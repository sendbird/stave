/**
 * Resolves the xterm theme from CSS custom properties.
 *
 * Extracted verbatim from `useTerminalInstance.ts` to keep that file within the
 * max-lines ratchet; no behavior changed. xterm.js cannot parse `oklch()`, so
 * the probe-element round-trip below is load-bearing — do not simplify it into a
 * direct `getComputedStyle` read of the custom properties.
 */
import type { ITheme } from "@xterm/xterm";

const DEFAULT_TERMINAL_BACKGROUND = "#1f1f1f";
const DEFAULT_TERMINAL_FOREGROUND = "#eaeaea";

/** Parse an rgb/rgba string and return the channel values, or null. */
function parseRgb(rgb: string): [number, number, number] | null {
  const match = rgb.match(/(\d+)/g);
  if (!match || match.length < 3) {
    return null;
  }
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

export function resolveTerminalTheme(): ITheme {
  if (typeof document === "undefined") {
    return {
      background: DEFAULT_TERMINAL_BACKGROUND,
      foreground: DEFAULT_TERMINAL_FOREGROUND,
    };
  }

  // xterm.js (and its WebGL addon) cannot parse oklch() color strings. Resolve
  // CSS custom properties through a probe element so the browser converts
  // oklch/etc. to an rgb() string that xterm can consume.
  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.backgroundColor = "var(--color-terminal)";
  probe.style.color = "var(--color-terminal-foreground)";
  probe.style.caretColor = "var(--color-primary)";
  document.documentElement.appendChild(probe);
  const computed = getComputedStyle(probe);
  const background = computed.backgroundColor || DEFAULT_TERMINAL_BACKGROUND;
  const foreground = computed.color || DEFAULT_TERMINAL_FOREGROUND;
  const cursor = computed.caretColor || foreground;
  probe.remove();

  // Derive a visible selection colour from the foreground so selected text
  // stands out regardless of the terminal palette.
  const fg = parseRgb(foreground);
  const selectionBackground = fg
    ? `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0.35)`
    : undefined;
  const selectionInactiveBackground = fg
    ? `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0.2)`
    : undefined;

  return {
    background,
    foreground,
    cursor,
    selectionBackground,
    selectionInactiveBackground,
  };
}

export function getResolvedTerminalThemeKey(theme: ITheme) {
  return `${theme.background}::${theme.foreground}::${theme.cursor}::${theme.selectionBackground}`;
}
