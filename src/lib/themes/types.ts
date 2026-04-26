// ---------------------------------------------------------------------------
// Theme type definitions
// ---------------------------------------------------------------------------

/**
 * The 27 core design-token names consumed by shadcn/ui components.
 * These are the tokens that appear in the settings Design Tokens editor.
 */
export const THEME_TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

/**
 * Extended theme tokens used by Stave-specific surfaces outside the shadcn core.
 * Built-in themes must define these as well so theme application stays complete.
 */
export const EXTENDED_THEME_TOKEN_NAMES = [
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "muse",
  "prompt-role-plan",
  "prompt-role-thinking",
  "prompt-role-effort",
  "prompt-role-fast",
  "prompt-mode-manual",
  "prompt-mode-guided",
  "prompt-mode-auto",
  "prompt-mode-custom",
  "overlay",
  "surface",
  "editor",
  "editor-foreground",
  "editor-muted",
  "editor-tab",
  "editor-tab-active",
  "terminal",
  "terminal-foreground",
  "diff-added",
  "diff-added-foreground",
  "diff-removed",
  "diff-removed-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "provider-codex",
  "provider-claude",
] as const;

export const BUILTIN_THEME_TOKEN_NAMES = [
  ...THEME_TOKEN_NAMES,
  ...EXTENDED_THEME_TOKEN_NAMES,
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type ExtendedThemeTokenName = (typeof EXTENDED_THEME_TOKEN_NAMES)[number];
export type BuiltinThemeTokenName = (typeof BUILTIN_THEME_TOKEN_NAMES)[number];
export type ThemeModeName = "light" | "dark";
export type ThemeTokenValues = Record<ThemeTokenName, string>;
export type ThemeOverrideValues = Partial<Record<ThemeTokenName, string>>;
export type BuiltinThemeTokenValues = Record<BuiltinThemeTokenName, string>;

/**
 * A named, self-contained theme preset.
 *
 * `baseMode` declares which appearance mode the theme is designed for -- its
 * CSS variables will be emitted under `:root` (light) or `.dark` (dark).
 *
 * `tokens` is a flat map of CSS custom-property names (without the leading
 * `--`) to values.  It may include both the 27 core design tokens and any
 * extended tokens defined in `globals.css` (editor, terminal, diff, etc.).
 *
 * This is also the JSON schema that user-installable themes follow.
 */
export interface CustomThemeDefinition {
  id: string;
  name: string;
  description: string;
  baseMode: ThemeModeName;
  version?: string;
  author?: string;
  tokens: Record<string, string>;
}
