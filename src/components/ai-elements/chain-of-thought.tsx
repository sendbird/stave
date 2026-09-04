import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Brain, Check, ChevronDown, Circle } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import {
  getRandomCompletionPhrase,
  getSeededCompletionPhrase,
} from "@/lib/completion-phrases";
import { useAgentStyle } from "./agent-style-context";
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
  /** Completed turn duration, appended to the collapsed completion phrase. */
  durationSeconds?: number;
}

interface ChainOfThoughtStepProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  /** Optional custom title node (for animated/gradient text etc.). */
  titleContent?: ReactNode;
  /** Always-visible description below the title (matches AI Elements API). */
  description?: ReactNode;
  /** Inline summary chip displayed next to the title. */
  summary?: ReactNode;
  /** Slot after the summary — status badge, elapsed time, and similar meta. */
  trailing?: ReactNode;
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  /** Custom icon element to replace the default status icon. */
  icon?: ReactNode;
  /** "bullet" renders a small dot instead of the status icon (for plain text steps). */
  variant?: "default" | "bullet";
  defaultOpen?: boolean;
  openWhen?: boolean;
  /** Close once when this flips true (beui `collapseOnComplete`). */
  collapseWhen?: boolean;
}

/* ─── Context ────────────────────────────────────────────────────── */

interface ChainOfThoughtContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
  summaryItems: TraceSummaryItem[];
  seed?: string;
  durationSeconds?: number;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null,
);

function useChainOfThoughtContext() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used inside <ChainOfThought />.",
    );
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
      <span
        className={cn("flex items-center justify-center", ICON_SIZE)}
        aria-hidden="true"
      >
        <span
          className={cn(
            "size-[0.35em] rounded-full",
            args.status === "active"
              ? "bg-foreground"
              : "bg-muted-foreground/50",
          )}
        />
      </span>
    );
  }

  /* Active reasoning — pulse the kind icon instead of a generic spinner. */
  if (args.status === "active" && args.kind === "thinking" && args.icon) {
    return (
      <span
        className={cn(
          ICON_CHILD,
          "text-foreground motion-safe:animate-thinking-shimmer",
        )}
      >
        {args.icon}
      </span>
    );
  }

  /* Active agent — keep the icon visible (title shimmer conveys activity). */
  if (args.status === "active" && args.kind === "agent" && args.icon) {
    return (
      <span className={cn(ICON_CHILD, "text-foreground")}>{args.icon}</span>
    );
  }

  /* Active state — generic spinner for tools, etc. */
  if (args.status === "active") {
    return (
      <Loader
        aria-hidden
        className="text-foreground"
        size="xs"
        variant="steps"
      />
    );
  }

  /* Custom icon with status-driven colour. */
  if (args.icon) {
    return (
      <span
        className={cn(
          ICON_CHILD,
          args.status === "done"
            ? "text-muted-foreground"
            : "text-muted-foreground/50",
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
  durationSeconds,
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
    () => ({ isStreaming, open, setOpen, summaryItems, seed, durationSeconds }),
    [isStreaming, open, summaryItems, seed, durationSeconds],
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

function formatTriggerDuration(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function ChainOfThoughtTrigger(
  args: ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { isStreaming, open, setOpen, summaryItems, seed, durationSeconds } =
    useChainOfThoughtContext();
  const showSummary = !open && !isStreaming && summaryItems.length > 0;

  /* Pick a completion phrase that is stable across Virtuoso unmount/remount
     cycles. When a seed is provided (typically the message ID), use the
     deterministic seeded variant so the same message always shows the same
     phrase. Fall back to the random variant for non-virtual contexts. */
  const completionPhrase = useMemo(
    () =>
      seed ? getSeededCompletionPhrase(seed) : getRandomCompletionPhrase(),
    [seed],
  );

  const showDuration =
    !open && !isStreaming && durationSeconds != null && durationSeconds > 0;

  return (
    <button
      type="button"
      className={cn(
        /* Wraps rather than squeezing: the completion phrase and the summary
           chips both stay on one line each, and the chip row drops below the
           phrase in narrow columns instead of collapsing into a word column. */
        "flex w-full flex-wrap items-center gap-x-[0.5em] gap-y-[0.3em] text-[0.875em] text-muted-foreground transition-colors hover:text-foreground",
        args.className,
      )}
      onClick={() => setOpen(!open)}
      {...args}
    >
      {isStreaming ? (
        <span className="inline-flex min-w-0 items-center gap-[0.5em] font-medium">
          <Loader
            aria-hidden
            cadence="reduced"
            className="shrink-0 text-foreground"
            size="sm"
            variant="pulse"
          />
          <ThinkingPhraseLabel active={isStreaming} />
        </span>
      ) : (
        <>
          <Brain className="size-[1.15em] shrink-0" />
          <span className="shrink-0 whitespace-nowrap font-medium">
            {completionPhrase}
          </span>
          {showDuration ? (
            <span className="shrink-0 text-[0.9em] tabular-nums text-muted-foreground/70">
              for {formatTriggerDuration(durationSeconds)}
            </span>
          ) : null}
        </>
      )}

      {/* Collapsed summary — inline after the label */}
      {showSummary ? (
        <span className="ml-auto flex shrink-0 items-center gap-x-[0.6em] whitespace-nowrap text-[0.75em] text-muted-foreground/70 motion-safe:animate-cot-step-in">
          {summaryItems.map((item, index) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-[0.3em]"
            >
              {index > 0 ? (
                <span className="text-border" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <span className="[&>svg]:size-[1.15em]">{item.icon}</span>
              <span>
                {item.count} {item.label}
              </span>
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

/*
 * Unmounts when closed rather than animating a collapse. Keeping long trace
 * subtrees out of the render tree matters more than a close transition here —
 * see docs/architecture/chat-message-rendering.md.
 */
export function ChainOfThoughtContent(args: HTMLAttributes<HTMLDivElement>) {
  const { open } = useChainOfThoughtContext();
  const agentStyle = useAgentStyle();
  if (!open) return null;

  /*
   * No height cap here. Capping the whole trace pushed the *step rows*
   * themselves off the top, so a long streaming thought faded out its own
   * "Thinking" header and read as if the step had vanished. The cap now lives
   * on the reasoning body alone (see `StreamingThoughtViewport`), which keeps
   * every step header pinned and only glides the prose that is actually long.
   */
  return (
    <div
      className={cn(
        "mt-[0.75em] [&>*:last-child_.cot-connector]:hidden",
        agentStyle === "legacy"
          ? /* TODO(agent-style-legacy): remove with the legacy trace visual. */
            "motion-safe:animate-cot-content-in"
          : "motion-safe:animate-trace-reveal",
        args.className,
      )}
      {...args}
    />
  );
}

/* ─── Streaming thought viewport ──────────────────────────────────── */

/**
 * Bottom-anchored, height-capped viewport for a single streaming thought.
 *
 * `justify-end` on a clipped column pushes overflow off the *top* while pinning
 * the newest line to the bottom — the stream-glide with no ResizeObserver, no
 * measured height, and no transform.
 *
 * The mask is a fixed-size layer anchored to the bottom rather than a plain
 * box-relative gradient. A box-relative gradient fades the *whole* body while
 * it is still short (a 2em box lies entirely inside a 3em fade); anchoring a
 * `CAP`-tall mask to the bottom means short content always lands in the mask's
 * opaque tail and the fade only appears once the box grows into the gradient
 * band. The `em` cap tracks `messageFontSize`.
 */
export function StreamingThoughtViewport(args: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex max-h-[14em] flex-col justify-end overflow-hidden [&>*]:shrink-0",
        "[mask-image:linear-gradient(to_bottom,transparent_0,black_2.5em)]",
        "[mask-size:100%_14em] [mask-position:bottom] [mask-repeat:no-repeat]",
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
  trailing,
  status = "pending",
  kind,
  icon,
  variant = "default",
  defaultOpen = false,
  openWhen = false,
  collapseWhen = false,
  className,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  const [open, setOpen] = useState(defaultOpen);
  const collapseSeenRef = useRef(false);
  const agentStyle = useAgentStyle();

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  /* Fires once per completion so a manual re-open is not stolen back. */
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

  const hasContent = children != null;
  const resolvedTitle = titleContent ?? title;
  /* TODO(agent-style-legacy): collapse to the `beui` classes once signed off. */
  const rowMotionClass =
    agentStyle === "legacy"
      ? "motion-safe:animate-cot-step-in"
      : "motion-safe:animate-trace-row-in";
  const revealMotionClass =
    agentStyle === "legacy"
      ? "motion-safe:animate-cot-step-in"
      : "motion-safe:animate-trace-reveal";

  return (
    <div
      className={cn(
        "flex gap-[0.7em] text-[0.875em]",
        status === "active" && "text-foreground",
        status === "done" && "text-muted-foreground",
        status === "pending" && "text-muted-foreground/50",
        rowMotionClass,
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
            {trailing}
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
            {trailing}
          </div>
        )}

        {description != null ? (
          <div className="mt-[0.25em] text-muted-foreground">{description}</div>
        ) : null}

        {hasContent && open ? (
          <div className={cn("mt-[0.5em]", revealMotionClass)}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
