import { ListTree, Wrench } from "lucide-react";
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

export type { ToolRunSectionProps, ToolRunSummaryProps } from "./ToolRun.parts";
export { aggregateRunStatus, isLiveRunState } from "./ToolRun.parts";

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
  /** Initial open state. Defaults to "open while the run is live". */
  defaultOpen?: boolean;
  /** Error output. Tinted danger and announced assertively when opened. */
  error?: React.ReactNode;
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
 * The disclosure animates a mounted row track, stays open while live or failed,
 * and collapses to its measured one-line record when it settles. A reader who
 * toggles it during a run takes control for that run. Duration comes only from
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
    // A failed, denied or approval-gated run counts as "live" for the
    // disclosure even though its clock has stopped: it is the one payload the
    // reader has to read, and the completed-collapse would hide the error the
    // instant it appeared. `isAttentionState` owns that list for the whole
    // family — do not re-derive it here.
    live: hasPayload && (live || isAttentionState(status)),
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
        <InlineDisclosureIcon disclosure={false}>
          <Wrench aria-hidden size={controlIconSizes.md} />
        </InlineDisclosureIcon>
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
        <InlineDisclosureIcon open={open}>
          <Wrench aria-hidden size={controlIconSizes.md} />
        </InlineDisclosureIcon>
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

export type ToolRunGroupProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  /** Accessible name for the list of runs. @default "Tool calls" */
  "aria-label"?: string;
  children?: React.ReactNode;
  /** Initial open state of a rolled-up group. Defaults to "open while any run is live". */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state of a rolled-up group. */
  open?: boolean;
  /**
   * Let the whole run collapse into one summary line. Off by default: a group
   * of three visible rows is already quiet, and hiding work behind a
   * disclosure nobody asked for is worse than showing it.
   * @default false
   */
  rollUp?: boolean;
  /**
   * Explicit lifecycle data for the roll-up summary. Visual children are not
   * inspected: fragments, wrappers, and conditional composition must not make
   * the aggregate status or duration silently wrong.
   */
  runs: readonly ToolRunGroupRun[];
  /**
   * Overrides the rolled-up status word. By default the group takes the most
   * urgent state among its runs — see `aggregateRunStatus`.
   */
  status?: AgentRunState;
  /** Overrides the "4 tool calls" summary label. */
  summary?: React.ReactNode;
} & XstyleProp;

export type ToolRunGroupRun = ElapsedSource & {
  status: AgentRunState;
};

/**
 * A run of sibling `ToolRun` rows, and the roll-up that hides them behind one
 * line.
 *
 * **Rung 3.** Compact gaps and each row's hover/open wash separate the run.
 * Tool rows are disclosures, not table records, so the default group does not
 * draw full-width rules between every sibling.
 *
 * **Why the roll-up is a compound part and not a separate component.** Three
 * reasons, in order of weight:
 *
 * 1. **The group owns explicit run data.** "4 tool calls", the aggregate
 *    status and the total duration are facts about the run, not facts React
 *    markup can reliably reveal. `runs` stays correct through fragments,
 *    wrappers and conditional composition; the children only render rows.
 * 2. **The summary row and list are one object in two states**, not two
 *    components that swap. §5.2 asks for a row-track animation between them;
 *    that is only expressible if the collapsed and expanded forms share a
 *    root. A `ToolRunRollup` beside a `ToolRunList` would have to mount one
 *    and unmount the other, which is exactly the transition the rule forbids.
 * 3. **`ToolRun.Group` says at the call site what is being grouped.** A
 *    top-level `ToolRunList` — what the old set shipped — is discoverable only
 *    from documentation, and §8 does not want a second generic list primitive
 *    in the family.
 *
 * The roll-up is a **row**, not a bordered pill: a pill would spend a
 * perimeter (rung 5) on a list header, and §1 reserves those for detachable
 * artifacts. It carries the same anatomy as the rows under it — an object glyph
 * that yields to the disclosure chevron on hover or focus, title, one colored
 * status word, right-aligned duration — because it *is* one of them, standing
 * for the rest.
 *
 * An empty group renders nothing. A blank slate for "no tools ran" is the
 * product's copy to write, not a shape this component should guess.
 */
function ToolRunGroup({
  "aria-label": ariaLabel = "Tool calls",
  children,
  className,
  defaultOpen,
  onOpenChange,
  open: openProp,
  rollUp = false,
  runs,
  status: statusProp,
  summary,
  xstyle,
  ...props
}: ToolRunGroupProps) {
  const items = flattenRunRows(children);
  const derivedStatus =
    statusProp ?? aggregateRunStatus(runs.map((run) => run.status)) ?? "done";
  const live = runs.some(
    (run) => isLiveRunState(run.status) || isAttentionState(run.status),
  );
  const totalMs = totalMeasuredDuration(runs);

  const { open, setOpen } = useSettleDisclosure({
    defaultOpen,
    live,
    onOpenChange,
    open: openProp,
  });

  if (items.length === 0) return null;

  const list = (
    <div
      aria-label={ariaLabel}
      className={sx(agentSurface.rowGroup, toolRunStyles.groupList)}
      role="list"
    >
      {items.map((item, index) => (
        <div
          className={sx(toolRunStyles.groupItem)}
          key={item.key ?? index}
          role="listitem"
        >
          {item}
        </div>
      ))}
    </div>
  );

  if (!rollUp) {
    return (
      <div
        {...props}
        className={cx(
          sx(agentSurface.bare, toolRunStyles.group, xstyle),
          className,
        )}
        data-tool-run-group-status={derivedStatus}
      >
        {list}
      </div>
    );
  }

  return (
    <CollapsibleRoot
      className={cx(
        sx(inlineDisclosure.root, toolRunStyles.group, xstyle),
        className,
      )}
      data-tool-run-group-status={derivedStatus}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      open={open}
      render={<div {...props} />}
    >
      <CollapsibleTrigger
        className={() =>
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
              focusRing.ringInset,
            ),
            "atelier-inline-disclosure-trigger",
          )
        }
      >
        <InlineDisclosureIcon open={open}>
          <ListTree aria-hidden size={controlIconSizes.md} />
        </InlineDisclosureIcon>
        <ToolRunSummary
          elapsedText={totalMs === null ? null : formatElapsed(totalMs, true)}
          status={derivedStatus}
          title={summary ?? defaultRollupSummary(runs.length)}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(
          sx(inlineDisclosure.panel, toolRunStyles.panel),
          "atelier-motion-collapse",
        )}
        keepMounted
      >
        <div className="atelier-motion-panel-inner">{list}</div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}

/** Fragments are transparent grouping syntax, not one visual tool row. */
function flattenRunRows(children: React.ReactNode): React.ReactElement[] {
  return React.Children.toArray(children).flatMap((item) => {
    if (!React.isValidElement(item)) return [];
    if (item.type === React.Fragment) {
      const fragment = item.props as { children?: React.ReactNode };
      return flattenRunRows(fragment.children);
    }
    return [item];
  });
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
