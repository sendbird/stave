import { createHighlighter } from "shiki";
import type { BundledLanguage } from "shiki";

/**
 * Shared Shiki singleton for host-owned highlighting. ADS CodeBlock /
 * DiffViewer stay highlighter-free; this module is the app-side adapter.
 */

export const SYNTAX_COMMON_LANGS: BundledLanguage[] = [
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
];

export type SyntaxTheme = "github-dark" | "github-light";

export type SyntaxSpan = {
  text: string;
  color?: string;
};

const EXTENSION_TO_LANG: Record<string, BundledLanguage> = {
  bash: "bash",
  cjs: "javascript",
  css: "css",
  cts: "typescript",
  diff: "diff",
  go: "go",
  htm: "html",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  patch: "diff",
  py: "python",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;
let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

export function getSyntaxHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      langs: SYNTAX_COMMON_LANGS,
      themes: ["github-dark", "github-light"],
    }).then((instance) => {
      highlighter = instance;
      return instance;
    });
  }
  return highlighterPromise;
}

export function languageFromFilePath(filePath: string): string | undefined {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return undefined;
  return EXTENSION_TO_LANG[base.slice(dot + 1).toLowerCase()];
}

const lineCache = new Map<string, SyntaxSpan[]>();
const MAX_LINE_CACHE = 2000;

export function highlightLineSpans(
  line: string,
  language?: string,
  theme: SyntaxTheme = "github-dark",
): SyntaxSpan[] {
  if (!highlighter || !language) {
    return [{ text: line }];
  }
  const cacheKey = `${theme}\0${language}\0${line}`;
  const cached = lineCache.get(cacheKey);
  if (cached) return cached;
  try {
    const { tokens } = highlighter.codeToTokens(line, {
      lang: language as BundledLanguage,
      theme,
    });
    const row = tokens[0] ?? [];
    const spans: SyntaxSpan[] =
      row.length === 0
        ? [{ text: line }]
        : row.map((token) => ({
            color: token.color,
            text: token.content,
          }));
    const joined = spans.reduce((acc, span) => acc + span.text, "");
    const resolved = joined === line ? spans : [{ text: line }];
    if (lineCache.size >= MAX_LINE_CACHE) {
      const firstKey = lineCache.keys().next().value;
      if (firstKey !== undefined) lineCache.delete(firstKey);
    }
    lineCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return [{ text: line }];
  }
}
