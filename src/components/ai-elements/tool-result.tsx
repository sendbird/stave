import { Button as AdsButton } from "@/components/ads/components/Button";
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
  RotateCcw,
  Terminal,
  Wrench,
} from "lucide-react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { TruncationWarningBanner } from "@/components/ai-elements/truncation-warning";
import { copyTextToClipboard } from "@/lib/clipboard";
import { detectTruncationNotice } from "@/lib/truncation-visibility";
import { Loader } from "@/components/ui/loader";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import type { ToolState } from "./tool";
import { toolResultStyles as s } from "./tool-result.styles";

/* ─── Types ───────────────────────────────────────────────────────── */

export type ToolResultStatus = "running" | "success" | "error" | "cancelled";
export type ToolResultKind = "terminal" | "request" | "custom";

export interface ToolResultProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
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
   * header, so duplicating the header bar inside an already-expanded
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
 * Semantic tokens only — `success` / `danger` / `muted` are
 * defined by every built-in theme, so no new colour tokens are introduced.
 */
const STATUS_TEXT_STYLE: Record<
  ToolResultStatus,
  (typeof s)[keyof typeof s]
> = {
  running: s.statusTextRunning,
  success: s.statusTextSuccess,
  error: s.statusTextError,
  cancelled: s.statusTextCancelled,
};

const STATUS_ICON_STYLE: Record<
  ToolResultStatus,
  (typeof s)[keyof typeof s]
> = {
  running: s.statusIconMuted,
  success: s.statusIconSuccess,
  error: s.statusIconError,
  cancelled: s.statusIconCancelled,
};

export function ToolResultStatusIcon(args: {
  status: ToolResultStatus;
  className?: string;
}) {
  switch (args.status) {
    case "running":
      return (
        <Loader
          aria-hidden
          className={cx(sx(s.statusIcon, s.statusIconMuted), args.className)}
          size="xs"
          variant="steps"
        />
      );
    case "success":
      return (
        <CircleCheck
          className={cx(sx(s.statusIcon, s.statusIconSuccess), args.className)}
        />
      );
    case "error":
      return (
        <CircleAlert
          className={cx(sx(s.statusIcon, s.statusIconError), args.className)}
        />
      );
    case "cancelled":
      return (
        <Ban
          className={cx(sx(s.statusIcon, s.statusIconCancelled), args.className)}
        />
      );
  }
}

function ToolResultKindIcon(args: {
  kind: ToolResultKind;
  className?: string;
}) {
  const className = cx(sx(s.statusIcon), args.className);
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
  return (
    useContext(ToolResultContext) ?? {
      status: "running",
      maxHeight: DEFAULT_MAX_HEIGHT,
    }
  );
}

/* ─── Actions ─────────────────────────────────────────────────────── */

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
    <AdsButton
      layout="host"
      type="button"
      className={sx(s.action, transition.colors)}
      onClick={() => {
        /* `copyTextToClipboard` throws when every copy path fails, so the
           "Copied" confirmation only shows on an actual write. */
        void copyTextToClipboard(args.text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? (
        <Check className={sx(s.actionIcon)} />
      ) : (
        <Copy className={sx(s.actionIcon)} />
      )}
      {copied ? "Copied" : "Copy"}
    </AdsButton>
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
    <div className={cx(sx(s.outputBlock), className)}>
      {label ? <p className={sx(s.outputLabel)}>{label}</p> : null}
      {truncationNotice ? (
        <TruncationWarningBanner
          notice={truncationNotice}
          compact
          className={sx(s.outputBanner)}
        />
      ) : null}
      <div className={sx(s.outputScroll)} style={{ maxHeight }}>
        {hasBody ? (
          linkify ? (
            <LinkifiedText
              as="pre"
              text={body}
              className={sx(
                s.outputPre,
                errorText ? s.outputPreError : s.outputPreMuted,
              )}
            />
          ) : (
            <pre
              className={sx(
                s.outputPre,
                errorText ? s.outputPreError : s.outputPreMuted,
              )}
            >
              {body}
            </pre>
          )
        ) : (
          <span className={sx(s.outputEmpty)}>No output.</span>
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

  const contextValue = useMemo(
    () => ({ status, maxHeight }),
    [status, maxHeight],
  );
  const hasActions = Boolean(copyText) || Boolean(onRetry);

  const footer =
    hasActions || !headless ? (
      <div className={sx(s.footer)}>
        <span className={sx(s.footerStatus, STATUS_TEXT_STYLE[status])}>
          <ToolResultStatusIcon status={status} />
          {STATUS_LABEL[status]}
        </span>
        {hasActions ? (
          <span className={sx(s.footerActions)}>
            {copyText ? <CopyAction text={copyText} /> : null}
            {onRetry ? (
              <AdsButton
                layout="host"
                type="button"
                className={sx(s.action, transition.colors)}
                onClick={onRetry}
              >
                <RotateCcw className={sx(s.actionIcon)} />
                Retry
              </AdsButton>
            ) : null}
          </span>
        ) : null}
      </div>
    ) : null;

  const body = (
    <div className={sx(s.body, headless ? null : s.bodyPadded)}>
      {children}
      {footer}
    </div>
  );

  if (headless) {
    return (
      <ToolResultContext.Provider value={contextValue}>
        <div className={cx("not-prose", className)} {...props}>
          {body}
        </div>
      </ToolResultContext.Provider>
    );
  }

  return (
    <ToolResultContext.Provider value={contextValue}>
      <section className={cx("not-prose", sx(s.rootSection), className)} {...props}>
        <AdsButton
          layout="host"
          type="button"
          className={sx(s.header, open && s.headerOpen)}
          onClick={() => setOpen((previous) => !previous)}
        >
          <ToolResultKindIcon kind={kind} className={sx(s.kindIcon)} />
          <span className={sx(s.headerTitle)}>{title ?? tool ?? "Tool"}</span>
          {tool && title ? (
            <span className={sx(s.headerTool)}>{tool}</span>
          ) : null}
          {meta ? <span className={sx(s.headerMeta)}>{meta}</span> : null}
          <span className={sx(s.headerTrailing)}>
            <ToolResultStatusIcon status={status} />
            <ChevronDown className={sx(s.chevron, transition.transform, open && s.chevronOpen)} />
          </span>
        </AdsButton>
        {open ? <div className={sx(s.headerBody)}>{body}</div> : null}
      </section>
    </ToolResultContext.Provider>
  );
}
