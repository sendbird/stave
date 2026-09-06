import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createHighlighter } from "shiki";
import type { BundledLanguage } from "shiki";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app.store";
import { codeBlockStyles as styles } from "./code-block.styles";

// ---------------------------------------------------------------------------
// Singleton highlighter
// ---------------------------------------------------------------------------

const COMMON_LANGS: BundledLanguage[] = [
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

let _highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighter({
      themes: ["github-dark"],
      langs: COMMON_LANGS,
    });
  }
  return _highlighterPromise;
}

// Shiki emits its own `<pre>`; style it via a transformer so the layout lives
// with the component instead of a descendant selector. Mirrors the previous
// `[&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:px-4 [&>pre]:py-3` contract.
const PRE_TRANSFORMER = {
  name: "stave-codeblock-pre",
  pre(node: { properties: Record<string, unknown> }) {
    const existingStyle =
      typeof node.properties.style === "string" ? node.properties.style : "";
    node.properties.style =
      `margin:0;overflow-x:auto;padding:0.75rem 1rem;${existingStyle}`;
  },
} as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CodeBlockContextValue {
  code: string;
}

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

function useCodeBlockContext() {
  const ctx = useContext(CodeBlockContext);
  if (!ctx) throw new Error("CodeBlock sub-components must be inside <CodeBlock />");
  return ctx;
}

// ---------------------------------------------------------------------------
// CodeBlock (root)
// ---------------------------------------------------------------------------

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language, showLineNumbers, className, children, ...props }: CodeBlockProps) {
  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div className={cx(sx(styles.root), className)} {...props}>
        {children}
        <CodeBlockContent code={code} language={language} showLineNumbers={showLineNumbers} />
      </div>
    </CodeBlockContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Highlight cache – survives component unmount/remount so previously
// highlighted code blocks never flash the un-highlighted fallback.
// ---------------------------------------------------------------------------

const _highlightCache = new Map<string, string>();
const MAX_HIGHLIGHT_CACHE_SIZE = 500;

function getHighlightCacheKey(code: string, language: string) {
  return `${language}\0${code}`;
}

// ---------------------------------------------------------------------------
// CodeBlockContent — async Shiki render
// ---------------------------------------------------------------------------

interface CodeBlockContentProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export const CodeBlockContent = memo(function CodeBlockContent({ code, language }: CodeBlockContentProps) {
  const resolvedLang = language ?? "bash";
  const cacheKey = getHighlightCacheKey(code, resolvedLang);
  const cached = _highlightCache.get(cacheKey);
  const [html, setHtml] = useState<string | null>(cached ?? null);
  const messageCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);

  useEffect(() => {
    // Already cached – apply immediately and skip the async path.
    const existing = _highlightCache.get(cacheKey);
    if (existing) {
      setHtml(existing);
      return;
    }

    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      try {
        const lang = resolvedLang as BundledLanguage;
        const result = hl.codeToHtml(code, {
          lang,
          theme: "github-dark",
          transformers: [PRE_TRANSFORMER],
        });
        if (!cancelled) {
          // Evict oldest entry when cache is full.
          if (_highlightCache.size >= MAX_HIGHLIGHT_CACHE_SIZE) {
            const firstKey = _highlightCache.keys().next().value;
            if (firstKey !== undefined) {
              _highlightCache.delete(firstKey);
            }
          }
          _highlightCache.set(cacheKey, result);
          setHtml(result);
        }
      } catch {
        if (!cancelled) setHtml(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, resolvedLang, cacheKey]);

  if (html) {
    return (
      <div
        className={sx(styles.content)}
        style={{ fontSize: `${messageCodeFontSize}px` }}
        // Shiki output is sanitised — no user content reaches dangerouslySetInnerHTML
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback: plain text while highlighter loads
  return (
    <pre
      className={sx(styles.fallbackPre)}
      style={{ fontSize: `${messageCodeFontSize}px` }}
    >
      <code>{code}</code>
    </pre>
  );
});

// ---------------------------------------------------------------------------
// Header sub-components
// ---------------------------------------------------------------------------

export function CodeBlockHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(sx(styles.header), className)} {...props} />;
}

export function CodeBlockTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(sx(styles.title), className)} {...props} />;
}

export function CodeBlockFilename({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx(sx(styles.filename), className)} {...props} />;
}

export function CodeBlockActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(sx(styles.actions), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// CodeBlockCopyButton
// ---------------------------------------------------------------------------

interface CodeBlockCopyButtonProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onError"> {
  onCopy?: () => void;
  onError?: (err: Error) => void;
  timeout?: number;
}

export function CodeBlockCopyButton({
  onCopy,
  onError,
  timeout = 2000,
  className,
  ...props
}: CodeBlockCopyButtonProps) {
  const { code } = useCodeBlockContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void copyTextToClipboard(code)
      .then(() => {
        setCopied(true);
        onCopy?.();
        setTimeout(() => setCopied(false), timeout);
      })
      .catch((error) => onError?.(error instanceof Error ? error : new Error("Clipboard write failed.")));
  };

  return (
    <AdsButton
      layout="host"
      type="button"
      xstyle={[styles.copyButton, transition.colors]}
      className={className}
      onClick={handleCopy}
      aria-label="Copy code"
      title="Copy code"
      {...props}
    >
      {copied ? (
        <Check className={sx(styles.copiedIcon)} />
      ) : (
        <Copy className={sx(styles.copyIcon)} />
      )}
    </AdsButton>
  );
}
