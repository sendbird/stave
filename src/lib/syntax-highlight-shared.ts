/**
 * Highlighting constants shared by the main-thread Shiki singleton and the
 * code-block worker. Keep this module free of Shiki imports so the worker
 * bundle only pulls the grammars it lists.
 */

export const SYNTAX_COMMON_LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "bash",
  "json",
  "yaml",
  "html",
  "css",
  "rust",
  "go",
  "markdown",
  "sql",
  "diff",
] as const;

export type SyntaxCommonLang = (typeof SYNTAX_COMMON_LANGS)[number];

/** Names of the adjusted syntax palettes registered from `syntax-themes.ts`. */
export const CODE_THEME_LIGHT = "stave-code-light";
export const CODE_THEME_DARK = "stave-code-dark";

/**
 * Code blocks are highlighted once with both palettes. Shiki writes each
 * token's light and dark color as `--shiki-light` / `--shiki-dark`, and
 * `globals.css` picks one from the app's `.dark` class, so a theme switch
 * repaints without highlighting again and one cached HTML string (keyed by
 * language and source only) serves both modes.
 */
export const CODE_BLOCK_THEMES = {
  light: CODE_THEME_LIGHT,
  dark: CODE_THEME_DARK,
} as const;

/** Class on the Shiki `<pre>` that the light/dark token rules in `globals.css` target. */
export const CODE_BLOCK_PRE_CLASS = "stave-code-block";

function classList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

// Shiki emits its own `<pre>`; style it via a transformer so the layout lives
// with the component instead of a descendant selector. The body is painted
// with the app's code surface so custom themes apply to it.
export const CODE_BLOCK_PRE_TRANSFORMER = {
  name: "stave-codeblock-pre",
  pre(node: { properties: Record<string, unknown> }) {
    const existingStyle =
      typeof node.properties.style === "string" ? node.properties.style : "";
    node.properties.style = `margin:0;overflow-x:auto;padding:0.75rem 1rem;${existingStyle};background-color:var(--editor);color:var(--editor-foreground)`;
    node.properties.class = [
      ...classList(node.properties.class),
      CODE_BLOCK_PRE_CLASS,
    ].join(" ");
  },
} as const;

export interface CodeBlockHighlightRequest {
  id: number;
  code: string;
  lang: string;
}

/**
 * `fatal` means the worker's highlighter itself could not start, as opposed to
 * one request naming a language it does not know.
 */
export type CodeBlockHighlightResponse =
  | { id: number; html: string }
  | { id: number; error: string; fatal?: boolean };
