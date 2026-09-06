import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes } from "react";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { copyTextToClipboard } from "@/lib/clipboard";
import { snippetStyles as styles } from "./snippet.styles";

// ---------------------------------------------------------------------------
// Snippet — lightweight inline code / terminal command display
// ---------------------------------------------------------------------------

interface SnippetProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  /** Optional prefix label, e.g. "$" for shell commands */
  prefix?: string;
}

export function Snippet({ code, prefix, className, ...props }: SnippetProps) {
  return (
    <div className={cx(sx(styles.root), className)} {...props}>
      {prefix ? <span className={sx(styles.prefix)}>{prefix}</span> : null}
      <span className={sx(styles.code)}>{code}</span>
      <SnippetCopyButton code={code} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SnippetCopyButton (internal — not exported separately to keep API clean)
// ---------------------------------------------------------------------------

function SnippetCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <AdsButton
      layout="host"
      type="button"
      xstyle={[styles.copyButton, transition.colors]}
      onClick={() => {
        void copyTextToClipboard(code)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {});
      }}
      aria-label="Copy"
      title="Copy"
    >
      {copied ? (
        <Check className={sx(styles.copiedIcon)} />
      ) : (
        <Copy className={sx(styles.copyIcon)} />
      )}
    </AdsButton>
  );
}
