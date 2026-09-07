import * as stylex from "@stylexjs/stylex";
import { BrainCircuit } from "lucide-react";
import * as React from "react";

import {
  CollapsiblePanel,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "../headless/collapsible";
import { agentSurface } from "../recipes/agent-surface";
import { controlHeights, controlIconSizes } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { inlineDisclosure } from "../recipes/inline-disclosure";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { InlineDisclosureIcon } from "./inline-disclosure-icon";
import { Loader, type LoaderVariant } from "./Loader";
import { TextShimmer } from "./TextShimmer";
import {
  formatElapsed,
  formatSpokenElapsed,
  useMeasuredElapsed,
  useSettleDisclosure,
  useTransitionAnnouncement,
  type ElapsedSource,
} from "./Thinking.parts";
import { VisuallyHidden } from "./VisuallyHidden";

export type { ElapsedSource, SettleDisclosureOptions } from "./Thinking.parts";

/**
 * Whether the model is thinking right now, or has stopped.
 *
 * Two values, and deliberately not a geometry switch: nothing about the
 * component's shape changes between them. What changes is whether the label
 * shimmers, whether the elapsed readout ticks, and whether the trace is open —
 * three expressions of one fact.
 */
export type ThinkingStatus = "settled" | "thinking";

export type ThinkingProps = Omit<React.ComponentProps<"div">, "children"> &
  ElapsedSource & {
    /**
     * The trace: what the model was actually reasoning about. Optional, and
     * omitting it is the common case — a `Thinking` with no trace is one quiet
     * line, not an empty disclosure.
     */
    children?: React.ReactNode;
    /**
     * Initial open state of the trace. Defaults to "open while thinking",
     * which is what makes the settle in §7.C a designed transition rather
     * than dead code.
     */
    defaultOpen?: boolean;
    /** Accessible name for the trace region. @default "Reasoning trace" */
    label?: string;
    /**
     * Activity cadence for the live leading mark. Keep the default for general
     * reasoning; choose another Loader cadence only when the phase names a
     * more specific work shape. Ignored once settled. @default "matrix"
     */
    loaderVariant?: LoaderVariant;
    onOpenChange?: (open: boolean) => void;
    /** Controlled open state of the trace. */
    open?: boolean;
    /**
     * The current phase, in the model's own words — "Reading the changelog",
     * "Comparing the two migrations". §6: a phase plus an elapsed time is what
     * an unknown wait is allowed to say. This is the line that shimmers.
     * @default "Thinking"
     */
    phase?: React.ReactNode;
    /**
     * Replaces the settled summary line. The default keeps the measured
     * elapsed time ("Thought for 14.2s"), so override it only when the product
     * has something truer to say — and keep the duration in it.
     */
    settledLabel?: React.ReactNode;
    /** @default "thinking" */
    status?: ThinkingStatus;
  } & XstyleProp;

/**
 * Transient model thought — `decisions/agent-surface-grammar.md` §7.C.
 *
 * **Rung 2, and only rung 2.** No perimeter: a compact trigger and quiet
 * translucent wash hold the trace. The old inline-start hairline repeated the
 * side-tab accent silhouette throughout long transcripts and made reasoning
 * look like a nested table.
 *
 * Four behaviours, and they are the whole component:
 *
 * 1. **The label shimmers while the model thinks**, through
 *    `recipes/text-shimmer` — composed via `TextShimmer`, never re-implemented.
 *    Two hand-rolled copies of that sweep had already drifted in trough ink,
 *    stop positions and reduced-motion arm before the recipe existed; a third
 *    copy here would be the same bug with a new name (§8). Under
 *    `prefers-reduced-motion` the recipe stops the animation, drops the
 *    gradient and paints the label in `colorTextMuted` — the label stays
 *    legible, it does not disappear or freeze mid-sweep.
 * 2. **The elapsed time is measured, never invented** (§6). It comes from
 *    `startedAt` (ticking off the shared 1s interval), from `settledAt`, or
 *    from a `durationMs` the caller already measured. Given none of those the
 *    component shows *no* duration rather than a plausible one, and it never
 *    shows a percentage — there is no percentage to know.
 * 3. **It settles rather than vanishing.** When `status` flips to `settled`
 *    the trace collapses on a row-track animation (§5.2) and the header
 *    becomes one quiet line that keeps the number: "Thought for 14.2s". A
 *    thinking indicator that disappears leaves the reader unable to answer
 *    "what took so long"; one that stays expanded buries the answer under the
 *    trace.
 * 4. **The reader outranks the automation.** Toggling the trace during a run
 *    switches the auto-collapse off for that run — see `useSettleDisclosure`.
 *
 * The trace is not a live region. Re-announcing a growing chain of thought on
 * every token is unusable; one polite `role="status"` line announces the two
 * transitions instead, and the settled announcement carries the duration as a
 * spoken phrase.
 */
export function Thinking({
  children,
  className,
  defaultOpen,
  durationMs,
  label = "Reasoning trace",
  loaderVariant = "matrix",
  now,
  onOpenChange,
  open: openProp,
  phase = "Thinking",
  settledAt,
  settledLabel,
  startedAt,
  status = "thinking",
  xstyle,
  ...props
}: ThinkingProps) {
  const thinking = status === "thinking";
  const elapsedMs = useMeasuredElapsed(
    { durationMs, now, settledAt, startedAt },
    thinking,
  );
  const hasTrace = React.Children.toArray(children).length > 0;
  const { open, setOpen } = useSettleDisclosure({
    defaultOpen,
    live: thinking && hasTrace,
    onOpenChange,
    open: openProp,
  });

  const elapsedText =
    elapsedMs === null ? null : formatElapsed(elapsedMs, !thinking);
  const spokenElapsed =
    elapsedMs === null ? null : formatSpokenElapsed(elapsedMs);

  const header = thinking ? (
    <>
      <span className={sx(styles.label)}>
        <TextShimmer>{phase}</TextShimmer>
      </span>
      {elapsedText ? (
        <span className={sx(agentSurface.meta, styles.elapsed)}>
          {elapsedText}
        </span>
      ) : null}
    </>
  ) : (
    <span className={sx(styles.label, styles.labelSettled)}>
      {settledLabel ?? (
        <>
          {elapsedText ? (
            <>
              Thought for{" "}
              <span className={sx(agentSurface.meta, styles.elapsedInline)}>
                {elapsedText}
              </span>
            </>
          ) : (
            "Finished thinking"
          )}
        </>
      )}
    </span>
  );

  // A settled announcement is only final once the elapsed value has resolved —
  // which is one render later when the duration is measured rather than passed
  // (see `useTransitionAnnouncement`'s `ready`). Without the gate this spoke
  // "Finished thinking" even when a duration was about to be available.
  const canMeasureElapsed =
    durationMs !== undefined ||
    settledAt !== undefined ||
    startedAt !== undefined;
  const announcementReady =
    thinking || spokenElapsed !== null || !canMeasureElapsed;
  const announcement = useTransitionAnnouncement(
    status,
    thinking
      ? "Thinking"
      : spokenElapsed
        ? `Thought for ${spokenElapsed}`
        : "Finished thinking",
    announcementReady,
  );

  const live = (
    <VisuallyHidden aria-live="polite" role="status">
      {announcement}
    </VisuallyHidden>
  );
  const leadingIcon = thinking ? (
    <Loader aria-hidden size="xs" tone="neutral" variant={loaderVariant} />
  ) : (
    <BrainCircuit aria-hidden size={controlIconSizes.md} />
  );

  if (!hasTrace) {
    return (
      <div
        {...props}
        className={cx(
          sx(agentSurface.row, styles.staticRow, xstyle),
          className,
        )}
        data-thinking-status={status}
      >
        <InlineDisclosureIcon disclosure={false}>
          {leadingIcon}
        </InlineDisclosureIcon>
        {header}
        {live}
      </div>
    );
  }

  return (
    <CollapsibleRoot
      className={cx(sx(inlineDisclosure.root, styles.root, xstyle), className)}
      data-thinking-status={status}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      open={open}
      render={<div {...props} />}
    >
      <CollapsibleTrigger
        className={(triggerState) =>
          cx(
            sx(
              inlineDisclosure.trigger,
              inlineDisclosure.triggerIntrinsic,
              open && inlineDisclosure.triggerOpen,
              styles.trigger,
              controlHeights.sm,
              transition.colors,
              focusRing.ring,
              // Inset: the row is full-bleed inside a transcript column and a
              // grouped stack, where an outset ring paints over the neighbour's
              // hairline instead of around this row.
              focusRing.ringInset,
              triggerState.disabled && styles.disabled,
            ),
            "atelier-inline-disclosure-trigger",
          )
        }
      >
        <InlineDisclosureIcon open={open}>{leadingIcon}</InlineDisclosureIcon>
        {header}
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(sx(styles.panel), "atelier-motion-collapse")}
        keepMounted
      >
        <div
          aria-label={label}
          className={cx(
            sx(inlineDisclosure.body, styles.trace),
            "atelier-motion-panel-inner",
          )}
          role="group"
        >
          {children}
        </div>
      </CollapsiblePanel>
      {live}
    </CollapsibleRoot>
  );
}

const styles = stylex.create({
  // `bare` carries a `space3` gap, which a grid keeps between the trigger and
  // a zero-height collapsed panel — a phantom band under every closed row.
  root: {
    gap: 0,
  },
  staticRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.controlHeightSm,
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderWidth: 0,
    display: "flex",
    gap: vars.space8,
    // A transcript row, not a control: `controlHeightSm`, not the tall control
    // box that made the old stack read as a column of cards.
    minBlockSize: vars.controlHeightSm,
    textAlign: "start",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  /**
   * §3: `fontSizeSm` is the largest thing in the family, and weight — not size
   * — carries the emphasis. `fontWeightSemibold` is reserved for page titles.
   */
  label: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * The settled line is quiet: secondary ink (§2), because a finished thought
   * is supporting copy for the answer under it, not the answer.
   */
  labelSettled: {
    color: vars.colorTextMuted,
  },
  /** Standalone readout, so it may not shrink below its own digits. */
  elapsed: {
    flexShrink: 0,
  },
  /**
   * The same machine register set inline inside a sentence — "Thought for
   * **14.2s**". `baseline` alignment is the reason this is a separate key: a
   * mono span inside proportional copy has to sit on the sentence's baseline
   * or the number floats.
   */
  elapsedInline: {
    display: "inline",
    verticalAlign: "baseline",
  },
  panel: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  /**
   * Rung 2: a low-contrast wash holds the trace without a side rail or nested
   * card. Secondary ink at relaxed leading keeps it prose to read, not a row to
   * scan.
   */
  trace: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
});
