import { createHighlighter } from "shiki";
import type { BundledLanguage } from "shiki";
import {
  CODE_THEME_DARK,
  CODE_THEME_LIGHT,
  SYNTAX_COMMON_LANGS,
  syntaxColorReference,
} from "./syntax-highlight-shared";
import {
  CODE_THEME_DARK_REGISTRATION,
  CODE_THEME_LIGHT_REGISTRATION,
} from "./syntax-themes";

/**
 * Shared Shiki singleton for host-owned highlighting. ADS CodeBlock /
 * DiffViewer stay highlighter-free; this module is the app-side adapter.
 */

export { SYNTAX_COMMON_LANGS };

export type SyntaxTheme = typeof CODE_THEME_LIGHT | typeof CODE_THEME_DARK;

/** The syntax palette for the app's current light or dark mode. */
export function syntaxThemeFor(isDark: boolean): SyntaxTheme {
  return isDark ? CODE_THEME_DARK : CODE_THEME_LIGHT;
}

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
  markdown: "markdown",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  patch: "diff",
  py: "python",
  pyi: "python",
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
      langs: [...SYNTAX_COMMON_LANGS],
      themes: [CODE_THEME_LIGHT_REGISTRATION, CODE_THEME_DARK_REGISTRATION],
    }).then((instance) => {
      highlighter = instance;
      return instance;
    });
  }
  return highlighterPromise;
}

/** Whether the shared highlighter has loaded, so a newly mounted diff can paint color on its first render. */
export function isSyntaxHighlighterReady(): boolean {
  return highlighter !== null;
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
  theme: SyntaxTheme = CODE_THEME_DARK,
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
            // Through the theme's replacement for this color, if it sets one.
            color: token.color
              ? syntaxColorReference(theme === CODE_THEME_DARK ? "dark" : "light", token.color)
              : undefined,
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
