// ---------------------------------------------------------------------------
// Base light / dark preset token values (Stave defaults)
// ---------------------------------------------------------------------------

import type { ThemeModeName, ThemeTokenValues } from "./types";

/**
 * Preset token values for the built-in light and dark modes.
 *
 * These match the current `:root` / `.dark` declarations in `globals.css`.
 */
export const PRESET_THEME_TOKENS: Record<ThemeModeName, ThemeTokenValues> = {
  light: {
    background: "oklch(0.985 0.006 75)",
    foreground: "oklch(0.225 0.028 255)",
    card: "oklch(0.998 0.003 75)",
    "card-foreground": "oklch(0.225 0.028 255)",
    popover: "oklch(0.998 0.003 75)",
    "popover-foreground": "oklch(0.225 0.028 255)",
    primary: "oklch(0.54 0.18 260)",
    "primary-foreground": "oklch(0.99 0.003 75)",
    secondary: "oklch(0.955 0.012 255)",
    "secondary-foreground": "oklch(0.28 0.035 255)",
    muted: "oklch(0.955 0.012 255)",
    "muted-foreground": "oklch(0.51 0.035 255)",
    accent: "oklch(0.91 0.04 255)",
    "accent-foreground": "oklch(0.28 0.075 255)",
    destructive: "oklch(0.56 0.2 25)",
    "destructive-foreground": "oklch(0.99 0.003 75)",
    border: "oklch(0.86 0.025 255)",
    input: "oklch(0.82 0.03 255)",
    ring: "oklch(0.62 0.17 260)",
    sidebar: "oklch(0.955 0.016 255)",
    "sidebar-foreground": "oklch(0.225 0.028 255)",
    "sidebar-primary": "oklch(0.54 0.18 260)",
    "sidebar-primary-foreground": "oklch(0.99 0.003 75)",
    "sidebar-accent": "oklch(0.91 0.04 255)",
    "sidebar-accent-foreground": "oklch(0.28 0.075 255)",
    "sidebar-border": "oklch(0.86 0.025 255)",
    "sidebar-ring": "oklch(0.62 0.17 260)",
  },
  dark: {
    background: "oklch(0.17 0.025 255)",
    foreground: "oklch(0.92 0.018 250)",
    card: "oklch(0.205 0.028 255)",
    "card-foreground": "oklch(0.92 0.018 250)",
    popover: "oklch(0.205 0.028 255)",
    "popover-foreground": "oklch(0.92 0.018 250)",
    primary: "oklch(0.71 0.15 252)",
    "primary-foreground": "oklch(0.16 0.03 255)",
    secondary: "oklch(0.245 0.028 255)",
    "secondary-foreground": "oklch(0.9 0.018 250)",
    muted: "oklch(0.245 0.028 255)",
    "muted-foreground": "oklch(0.68 0.035 250)",
    accent: "oklch(0.285 0.065 255)",
    "accent-foreground": "oklch(0.94 0.015 250)",
    destructive: "oklch(0.68 0.18 25)",
    "destructive-foreground": "oklch(0.16 0.03 255)",
    border: "oklch(0.32 0.032 255)",
    input: "oklch(0.28 0.032 255)",
    ring: "oklch(0.71 0.15 252)",
    sidebar: "oklch(0.145 0.025 255)",
    "sidebar-foreground": "oklch(0.9 0.018 250)",
    "sidebar-primary": "oklch(0.71 0.15 252)",
    "sidebar-primary-foreground": "oklch(0.16 0.03 255)",
    "sidebar-accent": "oklch(0.23 0.045 255)",
    "sidebar-accent-foreground": "oklch(0.94 0.015 250)",
    "sidebar-border": "oklch(0.29 0.032 255)",
    "sidebar-ring": "oklch(0.71 0.15 252)",
  },
};
