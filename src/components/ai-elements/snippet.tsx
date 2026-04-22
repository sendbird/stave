import type { HTMLAttributes } from "react";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border/70 bg-muted/30 font-mono text-xs",
        className,
      )}
      {...props}
    >
      {prefix ? (
        <span className="select-none border-r border-border/70 px-2 py-1 text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <span className="px-2 py-1">{code}</span>
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
    <button
      type="button"
      className="border-l border-border/70 px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
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
      {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
    </button>
  );
}
