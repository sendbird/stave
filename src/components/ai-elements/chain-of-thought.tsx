import { Button as AdsButton } from "@/components/ads/components/Button";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Brain, Check, ChevronDown, Circle } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { cx, sx } from "@/components/ads/utils/stylex";
import {
  getRandomCompletionPhrase,
  getSeededCompletionPhrase,
} from "@/lib/completion-phrases";
import { useAgentStyle } from "./agent-style-context";
import { ThinkingPhraseLabel } from "./thinking-phrase";
import { chainOfThoughtStyles as s } from "./chain-of-thought.styles";

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
  /** Close once when this flips true. */
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

/* Icons are supplied as bare lucide elements that inherit no size, so the em
   sizing that used to live on the wrapping `[&>svg]` selector is applied by
   cloning the element with an em-based `width`/`height`. */
function withIconSize(icon: ReactNode, size = "1.15em"): ReactNode {
  if (isValidElement<{ width?: number | string; height?: number | string }>(icon)) {
    return cloneElement(icon, { width: size, height: size });
  }
  return icon;
}

/* ─── Step icon (status + optional kind icon) ────────────────────── */

function StepIcon(args: {
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  icon?: ReactNode;
  variant?: "default" | "bullet";
}) {
  /* Bullet variant — small dot for text-only steps. */
  if (args.variant === "bullet") {
    return (
      <span className={sx(s.iconBox)} aria-hidden="true">
        <span
          className={sx(
            s.bullet,
            args.status === "active" ? s.bulletActive : s.bulletIdle,
          )}
        />
      </span>
    );
  }

  /* Active reasoning — pulse the kind icon instead of a generic spinner. */
  if (args.status === "active" && args.kind === "thinking" && args.icon) {
    return (
      <span className={sx(s.iconChild, s.iconThinking)}>
        {withIconSize(args.icon)}
      </span>
    );
  }

  /* Active agent — keep the icon visible (title shimmer conveys activity). */
  if (args.status === "active" && args.kind === "agent" && args.icon) {
    return (
      <span className={sx(s.iconChild, s.iconAgent)}>
        {withIconSize(args.icon)}
      </span>
    );
  }

  /* Active state — generic spinner for tools, etc. */
  if (args.status === "active") {
    return (
      <Loader
        aria-hidden
        className={sx(s.loaderColor)}
        size="xs"
        variant="steps"
      />
    );
  }

  /* Custom icon with status-driven colour. */
  if (args.icon) {
    return (
      <span
        className={sx(
          s.iconChild,
          args.status === "done" ? s.iconDone : s.iconPending,
        )}
      >
        {withIconSize(args.icon)}
      </span>
    );
  }

  /* Default status-only fallback. */
  if (args.status === "done") {
    return <Check className={sx(s.statusIcon, s.iconDone)} />;
  }
  return <Circle className={sx(s.statusIcon, s.iconPending)} />;
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
      {/* `not-prose` is a markdown-descendant reset integration hook. */}
      <div className={cx("not-prose", sx(s.root), className)} {...props}>
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
  {
    completionLabel,
    className,
    ...args
  }: ButtonHTMLAttributes<HTMLButtonElement> & { completionLabel?: string },
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
    <AdsButton
      layout="host"
      type="button"
      className={cx(sx(s.trigger), className)}
      onClick={() => setOpen(!open)}
      {...args}
    >
      {isStreaming ? (
        <span className={sx(s.streamingLabel)}>
          <Loader
            aria-hidden
            cadence="reduced"
            className={sx(s.streamingLoader)}
            size="sm"
            variant="matrix"
          />
          <ThinkingPhraseLabel active={isStreaming} />
        </span>
      ) : (
        <>
          <Brain className={sx(s.brainIcon)} />
          <span className={sx(s.completionLabel)}>
            {completionLabel ?? completionPhrase}
          </span>
          {showDuration ? (
            <span className={sx(s.durationLabel)}>
              for {formatTriggerDuration(durationSeconds)}
            </span>
          ) : null}
        </>
      )}

      {/* Collapsed summary — inline after the label */}
      {showSummary ? (
        <span className={sx(s.summary)}>
          {summaryItems.map((item, index) => (
            <span key={item.label} className={sx(s.summaryItem)}>
              {index > 0 ? (
                <span className={sx(s.summaryDivider)} aria-hidden="true">
                  ·
                </span>
              ) : null}
              <span className={sx(s.summaryItemIcon)}>
                {withIconSize(item.icon)}
              </span>
              <span>
                {item.count} {item.label}
              </span>
            </span>
          ))}
        </span>
      ) : null}

      <ChevronDown
        className={sx(
          s.chevron,
          !showSummary && s.chevronAuto,
          open && s.chevronOpen,
        )}
      />
    </AdsButton>
  );
}

/* ─── Content container ───────────────────────────────────────────── */

/*
 * Unmounts when closed rather than animating a collapse. Keeping long trace
 * subtrees out of the render tree matters more than a close transition here —
 * see docs/architecture/chat-message-rendering.md.
 */
export function ChainOfThoughtContent({
  className,
  ...args
}: HTMLAttributes<HTMLDivElement>) {
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
      className={cx(
        "cot-trace-content",
        sx(
          s.content,
          agentStyle === "legacy"
            ? /* TODO(agent-style-legacy): remove with the legacy trace visual. */
              s.contentLegacyMotion
            : s.contentTraceMotion,
        ),
        className,
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
export function StreamingThoughtViewport({
  className,
  ...args
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(sx(s.viewport), className)} {...args} />;
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
  const rowMotionStyle =
    agentStyle === "legacy" ? s.stepMotionRowLegacy : s.stepMotionRowTrace;
  const revealMotionStyle =
    agentStyle === "legacy" ? s.revealMotionLegacy : s.revealMotionTrace;

  return (
    <div
      className={cx(
        sx(
          s.step,
          status === "active" && s.stepActive,
          status === "done" && s.stepDone,
          status === "pending" && s.stepPending,
          rowMotionStyle,
        ),
        className,
      )}
      {...props}
    >
      {/* Icon column with vertical connector */}
      <div className={sx(s.iconColumn)}>
        <StepIcon status={status} kind={kind} icon={icon} variant={variant} />
        <div className={cx("cot-connector", sx(s.connector))} />
      </div>

      {/* Content column */}
      <div className={sx(s.contentColumn)}>
        {hasContent ? (
          <AdsButton
            layout="host"
            type="button"
            className={sx(s.disclosure)}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span>{resolvedTitle}</span>
            {summary}
            {trailing}
            <ChevronDown
              className={sx(s.disclosureChevron, open && s.disclosureChevronOpen)}
            />
          </AdsButton>
        ) : (
          <div className={sx(s.staticRow)}>
            <span>{resolvedTitle}</span>
            {summary}
            {trailing}
          </div>
        )}

        {description != null ? (
          <div className={sx(s.description)}>{description}</div>
        ) : null}

        {hasContent && open ? (
          <div className={sx(s.reveal, revealMotionStyle)}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
