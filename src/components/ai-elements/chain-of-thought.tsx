import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, ChevronDown, Circle, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRandomCompletionPhrase, getSeededCompletionPhrase } from "@/lib/completion-phrases";
import { ThinkingPhraseLabel } from "./thinking-phrase";

/* ─── Data type (used by the `steps` prop shorthand) ─────────────── */

export interface ChainOfThoughtStep {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "done";
  kind?: "thinking" | "tool" | "agent" | "system";
}

/* ─── Summary item (shown in collapsed trigger) ──────────────────── */

export interface TraceSummaryItem {
  icon: ReactNode;
  label: string;
  count: number;
}

/* ─── Props ──────────────────────────────────────────────────────── */

interface ChainOfThoughtProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  openWhen?: boolean;
  collapseWhen?: boolean;
  steps?: ChainOfThoughtStep[];
  /** Summary items shown in the trigger when collapsed and not streaming. */
  summaryItems?: TraceSummaryItem[];
  /** Stable seed for deterministic completion phrase selection.
   *  When provided, the trigger phrase stays consistent across
   *  Virtuoso unmount/remount cycles (e.g. message ID). */
  seed?: string;
}

interface ChainOfThoughtStepProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  /** Optional custom title node (for animated/gradient text etc.). */
  titleContent?: ReactNode;
  /** Always-visible description below the title (matches AI Elements API). */
  description?: ReactNode;
  /** Inline summary chip displayed next to the title. */
  summary?: ReactNode;
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  /** Custom icon element to replace the default status icon. */
  icon?: ReactNode;
  /** "bullet" renders a small dot instead of the status icon (for plain text steps). */
  variant?: "default" | "bullet";
  defaultOpen?: boolean;
  openWhen?: boolean;
}

/* ─── Context ────────────────────────────────────────────────────── */

interface ChainOfThoughtContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
  summaryItems: TraceSummaryItem[];
  seed?: string;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThoughtContext() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error("ChainOfThought components must be used inside <ChainOfThought />.");
  }
  return context;
}

/* ─── Step icon (status + optional kind icon) ────────────────────── */

/* Icon size token — em-based so icons scale with the step's font-size. */
const ICON_SIZE = "size-[1.15em]";
const ICON_CHILD = "[&>svg]:size-[1.15em]";

function StepIcon(args: {
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  icon?: ReactNode;
  variant?: "default" | "bullet";
}) {
  /* Bullet variant — small dot for text-only steps. */
  if (args.variant === "bullet") {
    return (
      <span className={cn("flex items-center justify-center", ICON_SIZE)} aria-hidden="true">
        <span
          className={cn(
            "size-[0.35em] rounded-full",
            args.status === "active" ? "bg-foreground" : "bg-muted-foreground/50",
          )}
        />
      </span>
    );
  }

  /* Active reasoning — pulse the kind icon instead of a generic spinner. */
  if (args.status === "active" && args.kind === "thinking" && args.icon) {
    return (
      <span className={cn(ICON_CHILD, "text-foreground motion-safe:animate-thinking-shimmer")}>
        {args.icon}
      </span>
    );
  }

  /* Active agent — keep the icon visible (title shimmer conveys activity). */
  if (args.status === "active" && args.kind === "agent" && args.icon) {
    return (
      <span className={cn(ICON_CHILD, "text-foreground")}>
        {args.icon}
      </span>
    );
  }

  /* Active state — generic spinner for tools, etc. */
  if (args.status === "active") {
    return <LoaderCircle className={cn(ICON_SIZE, "animate-spin text-foreground")} />;
  }

  /* Custom icon with status-driven colour. */
  if (args.icon) {
    return (
      <span
        className={cn(
          ICON_CHILD,
          args.status === "done" ? "text-muted-foreground" : "text-muted-foreground/50",
        )}
      >
        {args.icon}
      </span>
    );
  }

  /* Default status-only fallback. */
  if (args.status === "done") {
    return <Check className={cn(ICON_SIZE, "text-muted-foreground")} />;
  }
  return <Circle className={cn(ICON_SIZE, "text-muted-foreground/50")} />;
}

/* ─── Root ────────────────────────────────────────────────────────── */

export function ChainOfThought({
  className,
  isStreaming = false,
  defaultOpen = false,
  openWhen = false,
  collapseWhen = false,
  steps,
  summaryItems = [],
  seed,
  children,
  ...props
}: ChainOfThoughtProps) {
  const [open, setOpen] = useState(defaultOpen);
  const collapseSeenRef = useRef(false);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  useEffect(() => {
    if (collapseWhen && !collapseSeenRef.current) {
      collapseSeenRef.current = true;
      setOpen(false);
      return;
    }
    if (!collapseWhen) {
      collapseSeenRef.current = false;
    }
  }, [collapseWhen]);

  const contextValue = useMemo(
    () => ({ isStreaming, open, setOpen, summaryItems, seed }),
    [isStreaming, open, summaryItems, seed],
  );

  const resolvedChildren = children ?? (
    <>
      <ChainOfThoughtTrigger />
      <ChainOfThoughtContent>
        {(steps ?? []).map((step) => (
          <ChainOfThoughtStep
            key={step.id}
            title={step.label}
            description={step.detail}
            status={step.status}
            kind={step.kind}
          />
        ))}
      </ChainOfThoughtContent>
    </>
  );

  return (
    <ChainOfThoughtContext.Provider value={contextValue}>
      <div className={cn("not-prose w-full", className)} {...props}>
        {resolvedChildren}
      </div>
    </ChainOfThoughtContext.Provider>
  );
}

/* ─── Trigger ─────────────────────────────────────────────────────── */

export function ChainOfThoughtTrigger(args: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isStreaming, open, setOpen, summaryItems, seed } = useChainOfThoughtContext();
  const showSummary = !open && !isStreaming && summaryItems.length > 0;

  /* Pick a completion phrase that is stable across Virtuoso unmount/remount
     cycles. When a seed is provided (typically the message ID), use the
     deterministic seeded variant so the same message always shows the same
     phrase. Fall back to the random variant for non-virtual contexts. */
  const completionPhrase = useMemo(
    () => (seed ? getSeededCompletionPhrase(seed) : getRandomCompletionPhrase()),
    [seed],
  );

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-[0.5em] text-[0.875em] text-muted-foreground transition-colors hover:text-foreground",
        args.className,
      )}
      onClick={() => setOpen(!open)}
      {...args}
    >
      {isStreaming ? (
        <span className="inline-flex items-center gap-[0.5em] font-medium">
          <Brain className="size-[1.15em]" />
          <ThinkingPhraseLabel active={isStreaming} />
        </span>
      ) : (
        <>
          <Brain className="size-[1.15em]" />
          <span className="font-medium">{completionPhrase}</span>
        </>
      )}

      {/* Collapsed summary — inline after the label */}
      {showSummary ? (
        <span className="ml-auto flex items-center gap-x-[0.6em] text-[0.75em] text-muted-foreground/70 motion-safe:animate-cot-step-in">
          {summaryItems.map((item, index) => (
            <span key={item.label} className="inline-flex items-center gap-[0.3em]">
              {index > 0 ? <span className="text-border" aria-hidden="true">·</span> : null}
              <span className="[&>svg]:size-[1.15em]">{item.icon}</span>
              <span>{item.count} {item.label}</span>
            </span>
          ))}
        </span>
      ) : null}

      <ChevronDown
        className={cn(
          "size-[1.15em] shrink-0 transition-transform",
          showSummary ? "" : "ml-auto",
          open ? "rotate-180" : "rotate-0",
        )}
      />
    </button>
  );
}

/* ─── Content container ───────────────────────────────────────────── */

export function ChainOfThoughtContent(args: HTMLAttributes<HTMLDivElement>) {
  const { open } = useChainOfThoughtContext();
  if (!open) return null;
  return (
    <div
      className={cn(
        "mt-[0.75em] [&>*:last-child_.cot-connector]:hidden",
        "motion-safe:animate-cot-content-in",
        args.className,
      )}
      {...args}
    />
  );
}

/* ─── Step ─────────────────────────────────────────────────────────── */

export function ChainOfThoughtStep({
  title,
  titleContent,
  description,
  summary,
  status = "pending",
  kind,
  icon,
  variant = "default",
  defaultOpen = false,
  openWhen = false,
  className,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  const hasContent = children != null;
  const resolvedTitle = titleContent ?? title;

  return (
    <div
      className={cn(
        "flex gap-[0.7em] text-[0.875em]",
        status === "active" && "text-foreground",
        status === "done" && "text-muted-foreground",
        status === "pending" && "text-muted-foreground/50",
        "motion-safe:animate-cot-step-in",
        className,
      )}
      {...props}
    >
      {/* Icon column with vertical connector */}
      <div className="relative mt-[0.265em] flex flex-col items-center">
        <StepIcon status={status} kind={kind} icon={icon} variant={variant} />
        <div className="cot-connector mt-[0.35em] w-px flex-1 bg-border" />
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1 pb-[1em]">
        {hasContent ? (
          <button
            type="button"
            className="flex items-center gap-[0.35em] text-left"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span>{resolvedTitle}</span>
            {summary}
            <ChevronDown
              className={cn(
                "size-[0.85em] shrink-0 text-muted-foreground/70 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        ) : (
          <div className="flex items-center gap-[0.35em]">
            <span>{resolvedTitle}</span>
            {summary}
          </div>
        )}

        {description != null ? (
          <div className="mt-[0.25em] text-muted-foreground">{description}</div>
        ) : null}

        {hasContent && open ? (
          <div className="mt-[0.5em] motion-safe:animate-cot-step-in">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
