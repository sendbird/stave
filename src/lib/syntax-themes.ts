import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import type { ThemeRegistrationRaw } from "shiki/core";
import { CODE_THEME_DARK, CODE_THEME_LIGHT } from "./syntax-highlight-shared";

/**
 * Syntax palettes for code blocks and diffs, derived from the bundled GitHub
 * light/dark themes. A few token colors fall below 4.5:1 on Stave's default
 * code background (`--editor`); they are replaced by the same hue at a
 * lightness that reaches it. Everything else in the source themes is kept as
 * is. Themes with another code surface adjust further at runtime
 * (`src/lib/themes/syntax-contrast.ts`).
 */
export const SYNTAX_COLOR_ADJUSTMENTS = {
  light: {
    // variable, list markers, changed markup
    "#e36209": "#bd5208",
    // keyword, storage, deleted markup
    "#d73a49": "#d13847",
    // Rules that assume their own background, which the highlighter does not
    // paint: carriage return, and ignored/untracked markup.
    "#fafbfc": "#747576",
    "#f6f8fa": "#747577",
  },
  dark: {
    // comment
    "#6a737d": "#8b949e",
    // Rules that assume their own background, which the highlighter does not
    // paint: carriage return, and ignored/untracked markup.
    "#24292e": "#747a80",
    "#2f363d": "#727b83",
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>;

function adjustTheme(
  source: ThemeRegistrationRaw,
  name: string,
  replacements: Readonly<Record<string, string>>,
): ThemeRegistrationRaw {
  const replace = (color: string | undefined) =>
    color === undefined ? color : (replacements[color.toLowerCase()] ?? color);
  return {
    ...source,
    name,
    displayName: name,
    tokenColors: source.tokenColors?.map((rule) =>
      rule.settings?.foreground === undefined
        ? rule
        : {
            ...rule,
            settings: {
              ...rule.settings,
              foreground: replace(rule.settings.foreground),
            },
          },
    ),
  };
}

export const CODE_THEME_LIGHT_REGISTRATION = adjustTheme(
  githubLight,
  CODE_THEME_LIGHT,
  SYNTAX_COLOR_ADJUSTMENTS.light,
);

export const CODE_THEME_DARK_REGISTRATION = adjustTheme(
  githubDark,
  CODE_THEME_DARK,
  SYNTAX_COLOR_ADJUSTMENTS.dark,
);
