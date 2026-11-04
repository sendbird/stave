import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { useClipboardCopy } from "@/hooks/use-clipboard-copy";
import { highlightCodeBlockHtml } from "@/lib/syntax-highlight-client";
import { resolveCodeBlockLanguage } from "./code-block-language";
import { createHighlightCache } from "./code-block-highlight-cache";
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
  /**
   * The code is still being written. It shows as plain text and is highlighted
   * once it stops changing, so a streaming block neither queues a highlight per
   * delta nor fills the highlight cache with partial code.
   */
  isStreaming?: boolean;
}

export function CodeBlock({ code, language, showLineNumbers, isStreaming, className, children, ...props }: CodeBlockProps) {
  useTranslation();
  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div className={cx(sx(styles.root), className)} {...props}>
        {children}
        <CodeBlockContent
          code={code}
          language={language}
          showLineNumbers={showLineNumbers}
          isStreaming={isStreaming}
        />
      </div>
    </CodeBlockContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Highlight cache – survives component unmount/remount so previously
// highlighted code blocks never flash the un-highlighted fallback.
// ---------------------------------------------------------------------------

const _highlightCache = createHighlightCache();

// ---------------------------------------------------------------------------
// CodeBlockContent — async Shiki render
// ---------------------------------------------------------------------------

interface CodeBlockContentProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  isStreaming?: boolean;
}

export const CodeBlockContent = memo(function CodeBlockContent({ code, language, isStreaming }: CodeBlockContentProps) {
  useTranslation();
  const resolvedLang = resolveCodeBlockLanguage(language);
  const cacheKey = _highlightCache.keyFor(code, resolvedLang ?? "text");
  const cached = _highlightCache.get(cacheKey);
  const [highlightedHtml, setHtml] = useState<string | null>(cached ?? null);
  // A cache hit always matches the current code; while streaming, anything
  // else would be the highlight of an older, shorter version.
  const html = cached ?? (isStreaming ? null : highlightedHtml);
  const textScale = useMessageTextScale();
  const settingsCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);
  const messageCodeFontSize = scaleMessageCodeFontSize(textScale, settingsCodeFontSize);

  useEffect(() => {
    if (isStreaming || !resolvedLang) {
      setHtml(null);
      return;
    }
    setHtml(null);
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
  }, [code, resolvedLang, cacheKey, isStreaming]);

  if (html && resolvedLang) {
    return (
      <div
        className={sx(styles.content)}
        style={{ fontSize: `${messageCodeFontSize}px` }}
        // Shiki output is sanitised — no user content reaches dangerouslySetInnerHTML
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback: plain text while highlighter loads
  return (
    <pre
      className={sx(styles.fallbackPre, !resolvedLang && styles.plainPre)}
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
  // A refused clipboard always raises the error toast; `onError` is extra.
  const { status, copied, copy } = useClipboardCopy(timeout);

  const handleCopy = () => {
    void copy(code).then((ok) => {
      if (ok) onCopy?.();
      else onError?.(new Error(i18n.t("composer:codeBlock.extraCopy48")));
    });
  };

  return (
    <>
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
      <ClipboardCopyAnnouncement status={status} />
    </>
  );
}
