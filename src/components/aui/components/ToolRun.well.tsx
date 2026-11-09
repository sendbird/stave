import { i18n } from "@/i18n";
import { AlertCircle, Check, Minus, X } from "lucide-react";
import * as React from "react";

import {
  CollapsiblePanel,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "../headless/collapsible";
import { agentMotion, agentStagger } from "../recipes/agent-motion";
import { agentStatusWord } from "../recipes/agent-surface";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { inlineDisclosure } from "../recipes/inline-disclosure";
import { textShimmer } from "../recipes/text-shimmer";
import { transition } from "../recipes/transition";
import {
  themeProps,
  themeSlotProps,
  themeTargetClassName,
} from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  AgentGlyphSwap,
  AgentTextSwap,
  useSelfEntrance,
} from "./agent-motion";
import { AgentRetryButton, type AgentRetryProps } from "./agent-retry";
import { agentStateLabel, type AgentStepState } from "./agent-state";
import { InlineDisclosureIcon } from "./inline-disclosure-icon";
import { Loader } from "./Loader";
import { nodeText } from "./Thinking.parts";
import {
  isLiveRunState,
  useOpenBodyEntrance,
  statusWordTone,
  toolLoaderVariant,
} from "./ToolRun.parts";
import { toolRunWellStyles as styles } from "./ToolRun.well.styles";
import { VisuallyHidden } from "./VisuallyHidden";

/**
 * Host note: installed from #809 as an OPT-IN variant. Stave's `ToolRun`
 * keeps `variant="row"` as its default so the transcript does not change; a
 * surface opts in with `variant="well"`. The error plate's label reads
 * `ui:toolrun.error`, the same key the row path uses.
 *
 * The tool call as a TINT ROW (A4, 2026-11-07 — amends agent-surface-grammar
 * §7.C, which made it a bare text row). A chrome/anatomy variant over the same
 * ToolRun internals: the shared inline-disclosure trigger and icon slot (the
 * resting glyph swaps for the arrow in place), the 44px coarse-pointer target,
 * the per-state Loader cadence, the assertive error, and the retry action.
 *
 * What changes is the anatomy and the surface. One line on a recessed well:
 * status mark (the disclosure slot's resting glyph) · mono tool name in full
 * ink · what the call did · the measured duration. Opening it shows Arguments
 * / Result plates on the same well. A column of calls reads as a stack of
 * light wells — one object per call without a perimeter per call.
 *
 * Status is a SHAPE first (check, cadence, cross, alert) so it never rests on
 * colour alone. A settled run prints no word; a run that needs the reader —
 * failed, denied, gated, interrupted, canceled — also prints the word.
 */
const WORD_STATES = new Set<AgentStepState>([
  "approval",
  "canceled",
  "denied",
  "error",
  "failed",
  "interrupted",
]);

type WellRowProps = {
  count?: React.ReactNode;
  elapsedText?: string | null;
  icon?: React.ReactNode;
  status: AgentStepState;
  statusLabel?: React.ReactNode;
  title: React.ReactNode;
  tool?: React.ReactNode;
};

function WellRow({
  count,
  elapsedText,
  icon,
  status,
  statusLabel,
  title,
  tool,
}: WellRowProps) {
  const word = statusLabel ?? agentStateLabel[status];
  const showWord = statusLabel != null || WORD_STATES.has(status);

  return (
    <>
      <span className={sx(styles.lead)}>
        {icon ? (
          <span aria-hidden className={sx(styles.icon)}>
            {icon}
          </span>
        ) : null}
        {tool != null ? (
          <span className={sx(styles.tool)} title={nodeText(tool) ?? undefined}>
            {tool}
          </span>
        ) : null}
      </span>
      <span
        {...themeSlotProps("tool-run", "summary")}
        className={sx(styles.summary)}
      >
        <span
          className={sx(
            styles.title,
            tool == null && styles.titleLead,
            // The running call's words carry the "working" sweep; it stops
            // the moment the run settles (reduced motion: muted ink, still).
            isLiveRunState(status) && textShimmer.sweep,
          )}
        >
          {title}
        </span>
        {count != null ? (
          <span className={sx(styles.count)}>{count}</span>
        ) : null}
      </span>
      <span className={sx(styles.trail)}>
        {showWord ? (
          <span
            {...themeSlotProps("tool-run", "status")}
            className={sx(styles.word, agentStatusWord[statusWordTone(status)])}
          >
            <AgentTextSwap swapKey={status}>{word}</AgentTextSwap>
          </span>
        ) : (
          <VisuallyHidden>{word}</VisuallyHidden>
        )}
        {elapsedText ? (
          <span className={sx(styles.duration)}>{elapsedText}</span>
        ) : null}
      </span>
    </>
  );
}

/** The disclosure slot's resting glyph: the run's state as a shape. */
function StatusGlyph({ status }: { status: AgentStepState }) {
  return (
    <AgentGlyphSwap swapKey={glyphKind(status)}>
      <StatusShape status={status} />
    </AgentGlyphSwap>
  );
}

/** The glyph's identity: a cadence change or a settle swaps it; a word change does not. */
function glyphKind(status: AgentStepState): string {
  return toolLoaderVariant(status) ?? status;
}

function StatusShape({ status }: { status: AgentStepState }) {
  const cadence = toolLoaderVariant(status);
  if (cadence) {
    return (
      <span className={sx(styles.mark, styles.markLive)}>
        <Loader aria-hidden size="xs" tone="inherit" variant={cadence} />
      </span>
    );
  }
  const done =
    status === "completed" || status === "done" || status === "checkpointed";
  const warn = status === "approval" || status === "interrupted";
  // Host: `skipped` (a host-added state) reads as the neutral dash, like
  // `canceled` — nothing failed.
  const quiet = status === "canceled" || status === "skipped";
  const Glyph = done ? Check : warn ? AlertCircle : quiet ? Minus : X;
  return (
    <span
      className={sx(
        styles.mark,
        done
          ? styles.markSuccess
          : warn
            ? styles.markWarning
            : quiet
              ? styles.markNeutral
              : styles.markDanger,
      )}
    >
      <Glyph aria-hidden size={14} strokeWidth={2} />
    </span>
  );
}

export type ToolRunWellProps = Omit<React.ComponentProps<"div">, "children"> & {
  count?: React.ReactNode;
  elapsedText: string | null;
  error?: React.ReactNode;
  extra: React.ReactNode[];
  hasPayload: boolean;
  icon?: React.ReactNode;
  input?: React.ReactNode;
  inputLabel: React.ReactNode;
  liveRegion: React.ReactNode;
  onRetry?: AgentRetryProps["onRetry"];
  open: boolean;
  output?: React.ReactNode;
  outputLabel: React.ReactNode;
  retryLabel?: AgentRetryProps["retryLabel"];
  setOpen: (open: boolean) => void;
  status: AgentStepState;
  statusLabel?: React.ReactNode;
  title: React.ReactNode;
  tool?: React.ReactNode;
} & XstyleProp;

export function ToolRunWell({
  className,
  count,
  elapsedText,
  error,
  extra,
  hasPayload,
  icon,
  input,
  inputLabel,
  liveRegion,
  onRetry,
  open,
  output,
  outputLabel,
  retryLabel,
  setOpen,
  status,
  statusLabel,
  title,
  tool,
  xstyle,
  ...props
}: ToolRunWellProps) {
  const theme = themeProps("tool-run", { variant: "well" });
  // A call arriving in the transcript rises in on the spring; inside a
  // `ToolRun.Group` the group's list owns the (staggered) entrance instead.
  const enter = useSelfEntrance() && agentMotion.enter;
  const row = (
    <WellRow
      count={count}
      elapsedText={elapsedText}
      icon={icon}
      status={status}
      statusLabel={statusLabel}
      title={title}
      tool={tool}
    />
  );
  const glyph = <StatusGlyph status={status} />;

  if (!hasPayload) {
    return (
      <div
        {...props}
        {...theme}
        className={cx(
          sx(styles.root, enter, xstyle),
          theme.className,
          className,
        )}
        data-tool-run-status={status}
        data-tool-run-variant="well"
      >
        <div className={sx(styles.row, styles.staticRow)}>
          <InlineDisclosureIcon disclosure={false}>
            {glyph}
          </InlineDisclosureIcon>
          {row}
        </div>
        {liveRegion}
      </div>
    );
  }

  return (
    <CollapsibleRoot
      {...theme}
      className={cx(
        sx(inlineDisclosure.root, styles.root, enter, xstyle),
        theme.className,
        className,
      )}
      data-tool-run-status={status}
      data-tool-run-variant="well"
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      open={open}
      render={<div {...props} />}
    >
      <CollapsibleTrigger
        className={(triggerState) =>
          cx(
            sx(
              inlineDisclosure.trigger,
              open && inlineDisclosure.triggerOpen,
              controlHeights.sm,
              transition.colors,
              styles.row,
              focusRing.ring,
              focusRing.ringInset,
              triggerState.disabled && styles.disabled,
            ),
            "atelier-inline-disclosure-trigger",
            themeTargetClassName("tool-run-trigger"),
          )
        }
      >
        <InlineDisclosureIcon open={open}>{glyph}</InlineDisclosureIcon>
        {row}
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}
        keepMounted
      >
        <div className={cx(sx(styles.body), "atelier-motion-panel-inner")}>
          {input != null ? (
            <WellSection index={0} label={inputLabel} open={open}>
              {input}
            </WellSection>
          ) : null}
          {output != null ? (
            <WellSection index={1} label={outputLabel} open={open}>
              {output}
            </WellSection>
          ) : null}
          {error != null ? (
            <WellSection
              danger
              index={2}
              label={i18n.t("ui:toolrun.error")}
              open={open}
            >
              {error}
            </WellSection>
          ) : null}
          {extra}
          {onRetry ? (
            <div className={sx(styles.actions)}>
              <AgentRetryButton onRetry={onRetry} retryLabel={retryLabel} />
            </div>
          ) : null}
        </div>
      </CollapsiblePanel>
      {liveRegion}
    </CollapsibleRoot>
  );
}

/**
 * One payload block on a raised plate. `role="group"` with a labelled span
 * rather than a named section (a landmark per call would swamp navigation);
 * an error plate is `role="alert"`, announced assertively when it appears.
 */
function WellSection({
  children,
  danger = false,
  index,
  label,
  open,
}: {
  children: React.ReactNode;
  danger?: boolean;
  /** Arguments, Result, Error: the plates cascade in 35ms apart on open. */
  index: number;
  label: React.ReactNode;
  open: boolean;
}) {
  const labelId = React.useId();
  // Host: no replay when the transcript remounts an already-open well.
  const enter = useOpenBodyEntrance(open);
  return (
    <div
      {...themeSlotProps("tool-run", "section")}
      aria-labelledby={labelId}
      className={sx(
        styles.section,
        enter && agentMotion.enter,
        enter && agentStagger(index + 1),
      )}
      role="group"
    >
      <span className={sx(styles.sectionLabel)} id={labelId}>
        {label}
      </span>
      <div
        className={sx(styles.plate, danger && styles.plateDanger)}
        {...(danger ? { role: "alert" as const } : null)}
      >
        {children}
      </div>
    </div>
  );
}
