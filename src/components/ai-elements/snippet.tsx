import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes } from "react";
import { Check, Copy } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { useClipboardCopy } from "@/hooks/use-clipboard-copy";
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
  useTranslation();
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
  useTranslation();
  const { status, copied, copy } = useClipboardCopy(2000);
  return (
    <>
      <AdsButton
        layout="host"
        type="button"
        xstyle={[styles.copyButton, transition.colors]}
        onClick={() => {
          void copy(code);
        }}
        aria-label={i18n.t("composer:snippet.ariaLabel")}
        title={i18n.t("composer:snippet.title")}
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
