// ---------------------------------------------------------------------------
// DOM application helpers for theme system
// ---------------------------------------------------------------------------

import type { CustomThemeDefinition, ThemeModeName, ThemeOverrideValues, ThemeTokenName } from "./types";

/** Toggle the `.dark` class on the document root element. */
export function applyThemeClass(args: { enabled: boolean }) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", args.enabled);
}

// ---------------------------------------------------------------------------
// Base override CSS  (manual per-token user tweaks)
// ---------------------------------------------------------------------------

export function buildThemeOverrideCss(args: {
  themeOverrides: Record<ThemeModeName, ThemeOverrideValues>;
}) {
  const blocks: string[] = [];

  for (const mode of ["light", "dark"] as const) {
    const overrides = args.themeOverrides[mode];
    const declarations = Object.entries(overrides)
      .filter(
        (entry): entry is [ThemeTokenName, string] => Boolean(entry[1]?.trim()),
      )
      .map(([token, value]) => `--${token}: ${value};`);

    if (declarations.length === 0) {
      continue;
    }

    const selector = mode === "light" ? ":root" : ".dark";
    blocks.push(`${selector}{${declarations.join("")}}`);
  }

  return blocks.join("\n");
}

export function applyThemeOverrides(args: {
  themeOverrides: Record<ThemeModeName, ThemeOverrideValues>;
}) {
  if (typeof document === "undefined") {
    return;
  }

  const styleId = "stave-theme-overrides";
  const css = buildThemeOverrideCss({ themeOverrides: args.themeOverrides });
  let element = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!css) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("style");
    element.id = styleId;
    document.head.appendChild(element);
  }

  element.textContent = css;
}

// ---------------------------------------------------------------------------
// Custom theme CSS  (named presets)
// ---------------------------------------------------------------------------

/**
 * Generate a CSS text block for a custom theme.
 *
 * The selector is chosen from the theme's `baseMode`: `:root` for light,
 * `.dark` for dark.
 */
export function buildCustomThemeCss(args: {
  theme: CustomThemeDefinition;
}): string {
  const declarations = Object.entries(args.theme.tokens)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([token, value]) => `--${token}: ${value};`);

  if (declarations.length === 0) {
    return "";
  }

  const selector = args.theme.baseMode === "light" ? ":root" : ".dark";
  return `${selector}{${declarations.join("")}}`;
}

/**
 * Inject (or remove) a custom theme into the DOM.
 *
 * The custom-theme `<style>` element is inserted *before* the user-override
 * element (`stave-theme-overrides`) so that manual per-token overrides always
 * win in the cascade.
 */
export function applyCustomTheme(args: {
  theme: CustomThemeDefinition | null;
}) {
  if (typeof document === "undefined") {
    return;
  }

  const styleId = "stave-custom-theme";
  let element = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!args.theme) {
    element?.remove();
    return;
  }

  const css = buildCustomThemeCss({ theme: args.theme });

  if (!css) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("style");
    element.id = styleId;
    // Ensure custom-theme styles sit *before* manual overrides in the cascade.
    const overridesElement = document.getElementById("stave-theme-overrides");
    if (overridesElement) {
      document.head.insertBefore(element, overridesElement);
    } else {
      document.head.appendChild(element);
    }
  }

  element.textContent = css;
}

// ---------------------------------------------------------------------------
// Font overrides
// ---------------------------------------------------------------------------

export function applyFontOverrides(args: {
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
}) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const sans = [
    args.messageFontFamily,
    args.messageKoreanFontFamily,
    "sans-serif",
  ]
    .filter(Boolean)
    .join(", ");
  const mono = [args.messageMonoFontFamily, "monospace"]
    .filter(Boolean)
    .join(", ");
  root.style.setProperty("--font-sans", sans);
  root.style.setProperty("--font-mono", mono);
}

// ---------------------------------------------------------------------------
// Dark-mode resolution
// ---------------------------------------------------------------------------

export function resolveDarkModeForTheme(args: {
  themeMode: "light" | "dark" | "system";
  fallback?: boolean;
}) {
  if (args.themeMode === "dark") {
    return true;
  }
  if (args.themeMode === "light") {
    return false;
  }
  if (typeof window === "undefined") {
    return args.fallback ?? true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// ---------------------------------------------------------------------------
// Theme registry helpers
// ---------------------------------------------------------------------------

import { BUILTIN_CUSTOM_THEMES } from "./builtin-themes";

/** Look up a theme by ID from built-in + user themes. */
export function findCustomThemeById(args: {
  themeId: string;
  userThemes?: CustomThemeDefinition[];
}): CustomThemeDefinition | null {
  const allThemes = [...BUILTIN_CUSTOM_THEMES, ...(args.userThemes ?? [])];
  return allThemes.find((t) => t.id === args.themeId) ?? null;
}

/** Return all available themes (built-in first, then user-installed). */
export function listAllCustomThemes(args: {
  userThemes?: CustomThemeDefinition[];
}): CustomThemeDefinition[] {
  return [...BUILTIN_CUSTOM_THEMES, ...(args.userThemes ?? [])];
}
