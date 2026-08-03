import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Copy,
  Globe,
  LoaderCircle,
  RotateCcw,
  Terminal,
  Wrench,
} from "lucide-react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { TruncationWarningBanner } from "@/components/ai-elements/truncation-warning";
import { copyTextToClipboard } from "@/lib/clipboard";
import { detectTruncationNotice } from "@/lib/truncation-visibility";
import { cn } from "@/lib/utils";
import type { ToolState } from "./tool";

/* ─── Types ───────────────────────────────────────────────────────── */

export type ToolResultStatus = "running" | "success" | "error" | "cancelled";
export type ToolResultKind = "terminal" | "request" | "custom";

export interface ToolResultProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Tool identifier shown before the title in the header. */
  tool?: ReactNode;
  /** Status-aware heading. */
  title?: ReactNode;
  status?: ToolResultStatus;
  kind?: ToolResultKind;
  /** Secondary metadata (elapsed time, byte count, …). */
  meta?: ReactNode;
  /** Scroll limit for the output viewport, in px. */
  maxHeight?: number;
  /** Clipboard payload for the copy action. Omit to hide the button. */
  copyText?: string;
  /** Retry handler. Omit to hide the button. */
  onRetry?: () => void;
  /** Auto-close the disclosure once `status` leaves `running`. */
  collapseOnComplete?: boolean;
  defaultOpen?: boolean;
  /**
   * Render body and footer only. The trace uses its own step row as the
   * header, so duplicating the beui header bar inside an already-expanded
   * step would stack two identical titles.
   */
  headless?: boolean;
  children?: ReactNode;
}

const DEFAULT_MAX_HEIGHT = 220;

/* ─── Status mapping ──────────────────────────────────────────────── */

/** Bridges the transport-level `ToolState` onto the four display statuses. */
export function toToolResultStatus(state?: ToolState): ToolResultStatus {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "running";
    case "output-error":
      return "error";
    case "output-available":
      return "success";
    default:
      return "running";
  }
}

const STATUS_LABEL: Record<ToolResultStatus, string> = {
  running: "Running",
  success: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

/**
 * Semantic tokens only — `success` / `destructive` / `muted-foreground` are
 * defined by every built-in theme, so no new colour tokens are introduced.
 */
const STATUS_TEXT_CLASS: Record<ToolResultStatus, string> = {
  running: "text-muted-foreground",
  success: "text-success",
  error: "text-destructive",
  cancelled: "text-muted-foreground/70",
};

export function ToolResultStatusIcon(args: { status: ToolResultStatus; className?: string }) {
  const className = cn("size-[1.05em] shrink-0", args.className);
  switch (args.status) {
    case "running":
      return <LoaderCircle className={cn(className, "animate-spin text-muted-foreground")} />;
    case "success":
      return <CircleCheck className={cn(className, "text-success")} />;
    case "error":
      return <CircleAlert className={cn(className, "text-destructive")} />;
    case "cancelled":
      return <Ban className={cn(className, "text-muted-foreground/70")} />;
  }
}

function ToolResultKindIcon(args: { kind: ToolResultKind; className?: string }) {
  const className = cn("size-[1.05em] shrink-0", args.className);
  switch (args.kind) {
    case "terminal":
      return <Terminal className={className} />;
    case "request":
      return <Globe className={className} />;
    case "custom":
      return <Wrench className={className} />;
  }
}

/* ─── Context ─────────────────────────────────────────────────────── */

interface ToolResultContextValue {
  status: ToolResultStatus;
  maxHeight: number;
}

const ToolResultContext = createContext<ToolResultContextValue | null>(null);

function useToolResultContext(): ToolResultContextValue {
  return useContext(ToolResultContext) ?? { status: "running", maxHeight: DEFAULT_MAX_HEIGHT };
}

/* ─── Actions ─────────────────────────────────────────────────────── */

const ACTION_CLASS =
  "inline-flex items-center gap-[0.3em] rounded-md px-[0.5em] py-[0.25em] text-[0.75em] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";

function CopyAction(args: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied || typeof window === "undefined") {
      return;
    }
    const timeoutId = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  return (
    <button
      type="button"
      className={ACTION_CLASS}
      onClick={() => {
        /* `copyTextToClipboard` throws when every copy path fails, so the
           "Copied" confirmation only shows on an actual write. */
        void copyTextToClipboard(args.text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? <Check className="size-[1.05em]" /> : <Copy className="size-[1.05em]" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ─── Output viewport ─────────────────────────────────────────────── */

export interface ToolResultOutputProps {
  /** Raw output text. Rendered as monospace, wrapped, and linkified. */
  text?: string;
  /** Error body. Takes precedence over `text` and paints destructive. */
  errorText?: string;
  label?: string;
  /** Disable link detection for partial output that is still streaming. */
  linkify?: boolean;
  className?: string;
}

/**
 * Scrollable output viewport. `maxHeight` comes from the enclosing
 * `<ToolResult>` so a long `cat` never grows the trace row past the cap — it
 * scrolls in place instead.
 */
export function ToolResultOutput({
  text,
  errorText,
  label,
  linkify = true,
  className,
}: ToolResultOutputProps) {
  const { maxHeight } = useToolResultContext();
  const truncationNotice = detectTruncationNotice({
    text: errorText ?? text,
    source: "tool_output",
  });
  const body = errorText ?? text;
  const hasBody = typeof body === "string" && body.trim() !== "";

  return (
    <div className={cn("rounded-md border border-border/70 bg-background/40", className)}>
      {label ? (
        <p className="border-b border-border/70 px-[0.6em] py-[0.35em] text-[0.7em] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      {truncationNotice ? (
        <TruncationWarningBanner notice={truncationNotice} compact className="m-[0.5em]" />
      ) : null}
      <div className="overflow-auto p-[0.6em]" style={{ maxHeight }}>
        {hasBody ? (
          linkify ? (
            <LinkifiedText
              as="pre"
              text={body}
              className={cn(
                "whitespace-pre-wrap break-words font-mono text-[0.8em] leading-relaxed [overflow-wrap:anywhere]",
                errorText ? "text-destructive" : "text-muted-foreground",
              )}
            />
          ) : (
            <pre
              className={cn(
                "whitespace-pre-wrap break-words font-mono text-[0.8em] leading-relaxed [overflow-wrap:anywhere]",
                errorText ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {body}
            </pre>
          )
        ) : (
          <span className="text-[0.8em] text-muted-foreground/70">No output.</span>
        )}
      </div>
    </div>
  );
}

/* ─── Root ────────────────────────────────────────────────────────── */

export function ToolResult({
  tool,
  title,
  status = "running",
  kind = "custom",
  meta,
  maxHeight = DEFAULT_MAX_HEIGHT,
  copyText,
  onRetry,
  collapseOnComplete = true,
  defaultOpen = true,
  headless = false,
  className,
  children,
  ...props
}: ToolResultProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [collapseSeen, setCollapseSeen] = useState(false);

  /* Auto-collapse fires once per completion so a manual re-open sticks. */
  useEffect(() => {
    if (headless || !collapseOnComplete) {
      return;
    }
    if (status === "running") {
      setCollapseSeen(false);
      return;
    }
    if (!collapseSeen) {
      setCollapseSeen(true);
      setOpen(false);
    }
  }, [collapseOnComplete, collapseSeen, headless, status]);

  const contextValue = useMemo(() => ({ status, maxHeight }), [status, maxHeight]);
  const hasActions = Boolean(copyText) || Boolean(onRetry);

  const footer = hasActions || !headless ? (
    <div className="flex items-center gap-[0.4em] pt-[0.5em]">
      <span
        className={cn(
          "inline-flex items-center gap-[0.35em] text-[0.75em] font-medium",
          STATUS_TEXT_CLASS[status],
        )}
      >
        <ToolResultStatusIcon status={status} />
        {STATUS_LABEL[status]}
      </span>
      {hasActions ? (
        <span className="ml-auto inline-flex items-center gap-[0.2em]">
          {copyText ? <CopyAction text={copyText} /> : null}
          {onRetry ? (
            <button type="button" className={ACTION_CLASS} onClick={onRetry}>
              <RotateCcw className="size-[1.05em]" />
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  ) : null;

  const body = (
    <div className={cn("space-y-[0.5em]", headless ? undefined : "px-[0.75em] pb-[0.6em]")}>
      {children}
      {footer}
    </div>
  );

  if (headless) {
    return (
      <ToolResultContext.Provider value={contextValue}>
        <div className={cn("not-prose", className)} {...props}>
          {body}
        </div>
      </ToolResultContext.Provider>
    );
  }

  return (
    <ToolResultContext.Provider value={contextValue}>
      <section className={cn("not-prose overflow-hidden rounded-lg border bg-card", className)} {...props}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-[0.5em] px-[0.75em] py-[0.5em] text-[0.875em] text-left",
            open && "border-b",
          )}
          onClick={() => setOpen((previous) => !previous)}
        >
          <ToolResultKindIcon kind={kind} className="text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{title ?? tool ?? "Tool"}</span>
          {tool && title ? (
            <span className="shrink-0 font-mono text-[0.8em] text-muted-foreground">{tool}</span>
          ) : null}
          {meta ? (
            <span className="shrink-0 text-[0.8em] text-muted-foreground/70">{meta}</span>
          ) : null}
          <span className="ml-auto inline-flex shrink-0 items-center gap-[0.4em]">
            <ToolResultStatusIcon status={status} />
            <ChevronDown
              className={cn("size-[1.05em] transition-transform", open ? "rotate-180" : "rotate-0")}
            />
          </span>
        </button>
        {open ? <div className="pt-[0.6em]">{body}</div> : null}
      </section>
    </ToolResultContext.Provider>
  );
}
