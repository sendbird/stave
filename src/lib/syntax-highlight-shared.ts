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

export const CODE_BLOCK_THEME = "github-dark";

// Shiki emits its own `<pre>`; style it via a transformer so the layout lives
// with the component instead of a descendant selector.
export const CODE_BLOCK_PRE_TRANSFORMER = {
  name: "stave-codeblock-pre",
  pre(node: { properties: Record<string, unknown> }) {
    const existingStyle =
      typeof node.properties.style === "string" ? node.properties.style : "";
    node.properties.style = `margin:0;overflow-x:auto;padding:0.75rem 1rem;${existingStyle}`;
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
