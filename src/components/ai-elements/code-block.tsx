import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { copyTextToClipboard } from "@/lib/clipboard";
import { highlightCodeBlockHtml } from "@/lib/syntax-highlight-client";
import { useAppStore } from "@/store/app.store";
import { codeBlockStyles as styles } from "./code-block.styles";
import {
  scaleMessageCodeFontSize,
  useMessageTextScale,
} from "./message-text-scale";

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
  useTranslation();
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
  useTranslation();
  const resolvedLang = language ?? "bash";
  const cacheKey = getHighlightCacheKey(code, resolvedLang);
  const cached = _highlightCache.get(cacheKey);
  const [html, setHtml] = useState<string | null>(cached ?? null);
  const textScale = useMessageTextScale();
  const settingsCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);
  const messageCodeFontSize = scaleMessageCodeFontSize(textScale, settingsCodeFontSize);

  useEffect(() => {
    // Already cached – apply immediately and skip the async path.
    const existing = _highlightCache.get(cacheKey);
    if (existing) {
      setHtml(existing);
      return;
    }

    let cancelled = false;
    // Highlighting happens off the main thread; see syntax-highlight.worker.ts.
    highlightCodeBlockHtml(code, resolvedLang).then(
      (result) => {
        // Evict oldest entry when cache is full.
        if (_highlightCache.size >= MAX_HIGHLIGHT_CACHE_SIZE) {
          const firstKey = _highlightCache.keys().next().value;
          if (firstKey !== undefined) {
            _highlightCache.delete(firstKey);
          }
        }
        _highlightCache.set(cacheKey, result);
        if (!cancelled) setHtml(result);
      },
      () => {
        if (!cancelled) setHtml(null);
      },
    );
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
  useTranslation();
  return <div className={cx(sx(styles.header), className)} {...props} />;
}

export function CodeBlockTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  useTranslation();
  return <div className={cx(sx(styles.title), className)} {...props} />;
}

export function CodeBlockFilename({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  useTranslation();
  return <span className={cx(sx(styles.filename), className)} {...props} />;
}

export function CodeBlockActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  useTranslation();
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
  useTranslation();
  const { code } = useCodeBlockContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void copyTextToClipboard(code)
      .then(() => {
        setCopied(true);
        onCopy?.();
        setTimeout(() => setCopied(false), timeout);
      })
      .catch((error) => onError?.(error instanceof Error ? error : new Error(i18n.t("composer:codeBlock.extraCopy48"))));
  };

  return (
    <AdsButton
      layout="host"
      type="button"
      xstyle={[styles.copyButton, transition.colors]}
      className={className}
      onClick={handleCopy}
      aria-label={i18n.t("composer:codeBlock.ariaLabel")}
      title={i18n.t("composer:codeBlock.title")}
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
