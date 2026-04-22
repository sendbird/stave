import type { HTMLAttributes } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createHighlighter } from "shiki";
import type { BundledLanguage } from "shiki";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

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
      <div
        className={cn("my-2 overflow-hidden rounded-md border border-border/70", className)}
        {...props}
      >
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
        const result = hl.codeToHtml(code, { lang, theme: "github-dark" });
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
        className="font-mono [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:px-4 [&>pre]:py-3"
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
      className="overflow-x-auto bg-editor px-4 py-3 font-mono text-editor-foreground"
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
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border/70 bg-editor-muted px-3 py-1.5",
        className,
      )}
      {...props}
    />
  );
}

export function CodeBlockTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 text-[0.875em] text-muted-foreground", className)} {...props} />;
}

export function CodeBlockFilename({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-mono text-[0.875em]", className)} {...props} />;
}

export function CodeBlockActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-1", className)} {...props} />;
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
    <button
      type="button"
      className={cn(
        "rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      onClick={handleCopy}
      aria-label="Copy code"
      title="Copy code"
      {...props}
    >
      {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
    </button>
  );
}
