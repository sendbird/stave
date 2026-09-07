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

/*
 * The faces this app actually ships, appended behind whatever the user typed.
 *
 * These two properties are written as INLINE styles on `<html>`, so they beat
 * the `:root` stack in `globals.css` outright — a two-name stack here does not
 * "fall back to" the documented one, it replaces it. Two things break when the
 * tail is dropped: the default mono setting reads `JetBrains Mono` while the
 * face `fonts.css` loads is named `JetBrains Mono Variable`, so code text lands
 * on the generic monospace; and Hangul under an unavailable custom face has no
 * declared Korean typeface left to reach, which is exactly the OS-dependent
 * drift the Geist + Pretendard pairing exists to prevent.
 *
 * Kept in step with the `--font-sans` / `--font-mono` declarations in
 * `globals.css` (tests/prompt-editor-typography.test.ts gates the pair).
 */
const SANS_FALLBACK_TAIL = [
  "Geist Variable",
  "Pretendard Variable",
  "Pretendard",
  "Apple SD Gothic Neo",
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "sans-serif",
];

const MONO_FALLBACK_TAIL = [
  "JetBrains Mono Variable",
  "JetBrains Mono",
  "SFMono-Regular",
  "monospace",
];

/** Quote a family name unless it is a generic keyword or already quoted. */
const familyToken = (name: string) => {
  const value = name.trim();
  if (!value || /^["']/.test(value)) return value;
  // Generic keywords (`sans-serif`, `system-ui`, `-apple-system`) must stay
  // bare: quoted, they become a family name nothing matches.
  if (/^-?(?:[a-z]+-)*[a-z]+$/.test(value)) return value;
  return `"${value}"`;
};

const fontStack = (preferred: string[], tail: string[]) => {
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const name of [...preferred, ...tail]) {
    const token = familyToken(name);
    if (!token || seen.has(token.toLowerCase())) continue;
    seen.add(token.toLowerCase());
    stack.push(token);
  }
  return stack.join(", ");
};

/**
 * Compose the two font stacks the app writes onto `<html>`.
 *
 * Pure and exported so the fallback tail can be asserted without a DOM.
 */
export function buildFontStacks(args: {
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
}) {
  return {
    sans: fontStack(
      [args.messageFontFamily, args.messageKoreanFontFamily],
      SANS_FALLBACK_TAIL,
    ),
    mono: fontStack([args.messageMonoFontFamily], MONO_FALLBACK_TAIL),
  };
}

export function applyFontOverrides(args: {
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
}) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const { sans, mono } = buildFontStacks(args);
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
