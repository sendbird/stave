import { Wrench } from "lucide-react";
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
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  agentStateLabel,
  isAttentionState,
  type AgentRunState,
} from "./agent-state";
import {
  formatElapsed,
  nodeText,
  useMeasuredElapsed,
  useSettleDisclosure,
  useTransitionAnnouncement,
  type ElapsedSource,
} from "./Thinking.parts";
import {
  aggregateRunStatus,
  defaultRollupSummary,
  isLiveRunState,
  totalMeasuredDuration,
  ToolRunSection,
  ToolRunSummary,
  toolRunStyles,
} from "./ToolRun.parts";
import { InlineDisclosureIcon } from "./inline-disclosure-icon";
import { VisuallyHidden } from "./VisuallyHidden";
import {
  AgentRetryButton,
  type AgentRetryProps,
  isRetryableAgentState,
} from "./agent-retry";
import { ToolRunGroup } from "./ToolRun.group";

export type { ToolRunSectionProps, ToolRunSummaryProps } from "./ToolRun.parts";
export { aggregateRunStatus, isLiveRunState } from "./ToolRun.parts";
export type { ToolRunGroupProps, ToolRunGroupRun } from "./ToolRun.group";

type ToolRunBaseProps = Omit<React.ComponentProps<"div">, "children"> &
  ElapsedSource &
  AgentRetryProps;
export type ToolRunProps = ToolRunBaseProps & {
  /**
   * Free-form payload for a primitive that draws its own recessed surface —
   * Terminal, CodeBlock, JsonViewer, or LogViewer. Plain values belong in the
   * labelled `input`/`output` sections instead.
   */
  children?: React.ReactNode;
  /**
   * Right-aligned in the machine register: "12 matches", "3 files",
   * "1.4 kB". What the run produced, counted.
   */
  count?: React.ReactNode;
  /** Initial open state. Defaults to closed; attention states stay open. */
  defaultOpen?: boolean;
  /** Error output. Tinted danger and announced assertively when opened. */
  error?: React.ReactNode;
  /**
   * The object glyph, replacing the default wrench. A transcript is a list of
   * *kinds* of work — a command, a read, an edit, a search, a subagent — and
   * the glyph is the only part of the row that says which before a word is
   * read; a column of identical wrenches throws that away. Pass a bare icon
   * element: the disclosure slot sizes it and swaps it for the chevron.
   */
  icon?: React.ReactNode;
  /** Arguments the tool was called with. */
  input?: React.ReactNode;
  /** @default "Arguments" */
  inputLabel?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state. */
  open?: boolean;
  /** What the tool returned. */
  output?: React.ReactNode;
  /** @default "Output" */
  outputLabel?: React.ReactNode;
  /**
   * Where this run is in its lifecycle. Shared with every other agent
   * surface (`AgentRunState`) rather than re-declared here — two names for
   * one state is a bug you cannot see in a diff.
   */
  status: AgentRunState;
  /** Overrides the status word. Defaults to `agentStateLabel[status]`. */
  statusLabel?: React.ReactNode;
  /** What the run is doing, in human words: "Search the changelog". */
  title: React.ReactNode;
  /** The machine name of the tool: `repo.grep`, `bash`, `web.search`. */
  tool?: React.ReactNode;
} & XstyleProp;

/**
 * One tool invocation — `decisions/agent-surface-grammar.md` §7.C.
 *
 * **A text row, not a card.** This is the whole design. The component it
 * replaces drew a rounded bordered card per invocation, and a transcript with
 * ten calls in it was a wall of ten rectangles; the information in each one was
 * four short strings. So the row is rung 0 at rest — no perimeter, no fill,
 * padding and a hover wash and nothing else — and everything that used to be
 * chrome is now an ink or register step (§2): the tool name is mono at tertiary
 * ink, the status is one colored word, the count and duration are mono with
 * tabular figures so a ticking readout does not drag the row.
 *
 * Arguments, output and errors share one open body without nested wells;
 * Terminal or JsonViewer children keep only their own necessary surface.
 *
 * The disclosure animates a mounted row track and stays closed while the run
 * is live, so a turn of tool calls is a list of status rows rather than a
 * stack of open payloads. A failure, denial or approval gate stays open —
 * collapsing those would hide the one payload worth reading. A reader who
 * toggles a row takes control for that run. Duration comes only from
 * `durationMs`, `startedAt`/`settledAt`, or a real live interval; missing
 * measurement renders no plausible substitute.
 *
 * `ToolRun.Group` gives sibling calls compact spacing and an optional roll-up.
 */
function ToolRunRoot({
  children,
  className,
  count,
  defaultOpen,
  durationMs,
  error,
  icon,
  input,
  inputLabel = "Arguments",
  now,
  onOpenChange,
  onRetry,
  open: openProp,
  output,
  outputLabel = "Output",
  retryLabel,
  settledAt,
  startedAt,
  status,
  statusLabel,
  title,
  tool,
  xstyle,
  ...props
}: ToolRunProps) {
  const live = isLiveRunState(status);
  const elapsedMs = useMeasuredElapsed(
    { durationMs, now, settledAt, startedAt },
    live,
  );
  const elapsedText =
    elapsedMs === null ? null : formatElapsed(elapsedMs, !live);

  const glyph = icon ?? <Wrench aria-hidden size={controlIconSizes.md} />;
  const extra = React.Children.toArray(children);
  const retryable = isRetryableAgentState(status) && onRetry != null;
  const hasPayload =
    input != null ||
    output != null ||
    error != null ||
    extra.length > 0 ||
    retryable;

  const { open, setOpen } = useSettleDisclosure({
    defaultOpen,
    // Only attention keeps the payload on screen. A running call stays
    // collapsed so the rail stays a list of status rows; the header still
    // carries the live clock. `isAttentionState` owns the stay-open list
    // for the whole family — do not re-derive it here.
    live: hasPayload && isAttentionState(status),
    onOpenChange,
    open: openProp,
  });

  const summary = (
    <ToolRunSummary
      count={count}
      elapsedText={elapsedText}
      status={status}
      statusLabel={statusLabel}
      title={title}
      tool={tool}
    />
  );

  const announcement = useTransitionAnnouncement(
    status,
    [
      nodeText(title) ?? nodeText(tool) ?? "Tool run",
      agentStateLabel[status],
    ].join(" "),
  );
  const liveRegion = (
    <VisuallyHidden aria-live="polite" role="status">
      {announcement}
    </VisuallyHidden>
  );

  if (!hasPayload) {
    return (
      <div
        {...props}
        className={cx(
          sx(agentSurface.row, toolRunStyles.row, xstyle),
          className,
        )}
        data-tool-run-status={status}
      >
        <InlineDisclosureIcon disclosure={false}>{glyph}</InlineDisclosureIcon>
        {summary}
        {liveRegion}
      </div>
    );
  }

  return (
    <CollapsibleRoot
      className={cx(
        sx(inlineDisclosure.root, toolRunStyles.root, xstyle),
        className,
      )}
      data-tool-run-status={status}
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
              toolRunStyles.row,
              controlHeights.sm,
              transition.colors,
              toolRunStyles.trigger,
              focusRing.ring,
              // Inset: these rows are full-bleed inside a group, where an outset
              // ring paints over the neighbour's hairline instead of around the
              // focused row.
              focusRing.ringInset,
              triggerState.disabled && toolRunStyles.disabled,
            ),
            "atelier-inline-disclosure-trigger",
          )
        }
      >
        <InlineDisclosureIcon open={open}>{glyph}</InlineDisclosureIcon>
        {summary}
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(
          sx(inlineDisclosure.panel, toolRunStyles.panel),
          "atelier-motion-collapse",
        )}
        keepMounted
      >
        <div
          className={cx(
            sx(inlineDisclosure.body, toolRunStyles.payload),
            "atelier-motion-panel-inner",
          )}
        >
          {input != null ? (
            <ToolRunSection label={inputLabel} open={open}>
              {input}
            </ToolRunSection>
          ) : null}
          {output != null ? (
            <ToolRunSection label={outputLabel} open={open}>
              {output}
            </ToolRunSection>
          ) : null}
          {error != null ? (
            <ToolRunSection danger label="Error" open={open}>
              {error}
            </ToolRunSection>
          ) : null}
          {extra}
          {retryable ? (
            <div className={sx(toolRunStyles.actions)}>
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
 * `ToolRun` ships one compound part, `ToolRun.Group`, per
 * `decisions/composition-api.md`: the sub-part hangs off the root so a call
 * site reads as the thing it groups, and the group's roll-up cannot drift from
 * the row anatomy it stands for.
 */
export const ToolRun = Object.assign(ToolRunRoot, {
  Group: ToolRunGroup,
});
