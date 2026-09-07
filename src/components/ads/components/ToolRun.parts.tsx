import * as React from "react";

import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { sx, type XstyleProp } from "../utils/stylex";
import {
  agentStateLabel,
  agentStateTone,
  isQuietState,
  type AgentRunState,
  type AgentStatusTone,
} from "./agent-state";
import { Loader, type LoaderVariant } from "./Loader";
import { nodeText, type ElapsedSource } from "./Thinking.parts";
import { toolRunStyles } from "./ToolRun.styles";
import { VisuallyHidden } from "./VisuallyHidden";

export { toolRunStyles };

/**
 * The row anatomy, the status vocabulary and the stylesheet behind `ToolRun`.
 *
 * Split out of `ToolRun.tsx` so the two components that file exports — the row
 * and its group — stay readable beside each other; the group's roll-up only
 * makes sense next to the row it rolls up.
 */

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * Is this run still going?
 *
 * The three "not finished yet" states, named once. It decides whether the
 * elapsed readout ticks, whether the disclosure is open, and whether a group
 * counts as live — three questions that must not be able to answer
 * differently.
 */
export function isLiveRunState(state: AgentRunState): boolean {
  return (
    state === "running" ||
    state === "pending" ||
    state === "queued" ||
    state === "retrying" ||
    state === "resumed"
  );
}

function toolLoaderVariant(state: AgentRunState): LoaderVariant | null {
  switch (state) {
    case "pending":
      return "spinner";
    case "queued":
      return "dots";
    case "running":
      return "steps";
    case "retrying":
      return "ripple";
    case "resumed":
      return "signal";
    default:
      return null;
  }
}

/**
 * Severity order for rolling several runs up into one word.
 *
 * A group of four calls where one failed is a failed group; a group where
 * three finished and one is still going is a running group. The order is
 * "what does the reader have to deal with first", so a gate waiting on a human
 * outranks a failure they can read at their leisure.
 */
const ROLLUP_PRIORITY: AgentRunState[] = [
  "approval",
  "error",
  "failed",
  "denied",
  "interrupted",
  "canceled",
  "retrying",
  "running",
  "queued",
  "pending",
  "resumed",
  "checkpointed",
  "completed",
  "done",
];

/**
 * The `agentStatusWord` key for a run state.
 *
 * `agentStateTone` with one deliberate exception: a run that **finished as
 * expected** takes the neutral key rather than the success key. That table was
 * written for dotted `Badge` status labels, where a tone is the only channel;
 * here the word
 * itself already says "Completed", and §2's quiet-state rule applies —
 * `isAttentionState`'s own docstring puts it as "a column of green Completed
 * pills is chrome with no information in it". Rendered against realistic data
 * the difference is not subtle: with success green, eight finished rows make a
 * green column that outweighs every title on the surface and the one failed row
 * has to compete with it. Neutral for the expected outcome means color in this
 * family means *look at this*.
 */
export function statusWordTone(state: AgentRunState): AgentStatusTone {
  return state === "completed" || state === "done"
    ? "neutral"
    : agentStateTone[state];
}

/** The one state that stands for a run of states. `null` for an empty run. */
export function aggregateRunStatus(
  states: AgentRunState[],
): AgentRunState | null {
  if (states.length === 0) return null;
  const present = new Set(states);
  return (
    ROLLUP_PRIORITY.find((state) => present.has(state)) ?? states[0] ?? null
  );
}

/** "4 tool calls" — the roll-up's own title. */
export function defaultRollupSummary(count: number): string {
  return `${count} tool ${count === 1 ? "call" : "calls"}`;
}

/**
 * The total elapsed time of a run of runs, or `null` — §6 again.
 *
 * A group reports a duration only when **every** run in it reports one.
 * Summing the four that measured themselves and presenting that as the group's
 * time would be a number nobody measured, and it would shrink as more runs
 * arrived without one.
 */
export function totalMeasuredDuration(
  sources: readonly ElapsedSource[],
): number | null {
  if (sources.length === 0) return null;
  let total = 0;
  for (const { durationMs, settledAt, startedAt } of sources) {
    if (durationMs !== undefined) {
      if (!Number.isFinite(durationMs)) return null;
      total += Math.max(0, durationMs);
      continue;
    }
    if (startedAt === undefined || settledAt === undefined) return null;
    const started = startedAt instanceof Date ? startedAt.getTime() : startedAt;
    const settled = settledAt instanceof Date ? settledAt.getTime() : settledAt;
    if (!Number.isFinite(started) || !Number.isFinite(settled)) return null;
    total += Math.max(0, settled - started);
  }
  return total;
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export type ToolRunSummaryProps = {
  /** Right-aligned, machine register: "12 matches", "3 files". */
  count?: React.ReactNode;
  /** Already formatted by `formatElapsed`; `null` when nothing is known. */
  elapsedText?: string | null;
  status: AgentRunState;
  /** Overrides the word. Defaults to `agentStateLabel[status]`. */
  statusLabel?: React.ReactNode;
  title: React.ReactNode;
  /** The machine name of the tool: `repo.grep`, `bash`, `web.search`. */
  tool?: React.ReactNode;
} & XstyleProp;

/**
 * Everything after the chevron: a primary title/status line and recoverable
 * machine metadata. The two groups share one line when space permits; metadata
 * wraps below before it can erase the tool-run identity in a narrow owner.
 *
 * **This is the object that used to be a card.** Four pieces of information,
 * four ink/register steps (§2), and no chrome at all: the tool name is mono at
 * tertiary ink because it is a value the agent was given rather than language
 * it wrote, and the status is a colored *word* — not a badge, not a pill, not a
 * bordered chip. The version this replaces said "running" with a bordered pill
 * inside a bordered header inside a bordered card: three perimeters for one
 * word, ten of them per transcript.
 *
 * Truncation order is deliberate (§10, realistic data): the title keeps a
 * visible share beside status, and the count and the duration are never cut —
 * a clipped digit is a wrong number rather than a shortened one. The **tool
 * target** is the one value that gives: it holds a whole shell command, an
 * absolute path or a URL, and letting it take a second line meant one row in a
 * transcript was two rows tall for a value the reader was scanning past. It now
 * ellipsizes in place, on one line, with the full value on the element's
 * `title` when it is plain text. Below the 22rem container arm the group still
 * stacks, because at that width there is no line left to share.
 *
 * A settled run does not paint its status word at all — `isQuietState`, and the
 * word stays in the accessibility tree. See that predicate for the argument.
 */
export function ToolRunSummary({
  count,
  elapsedText,
  status,
  statusLabel,
  title,
  tool,
  xstyle,
}: ToolRunSummaryProps) {
  const loaderVariant = toolLoaderVariant(status);
  const word = statusLabel ?? agentStateLabel[status];
  /*
   * `isQuietState` decides whether the word is painted; an explicit
   * `statusLabel` overrides that, because a caller who supplied their own word
   * for a settled run asked for a word rather than for the default report of
   * the expected outcome. There is no `loaderVariant` on a quiet state, so
   * nothing else in this span needs painting either — the whole span goes.
   */
  const quiet = statusLabel == null && isQuietState(status);
  /*
   * The full value, for a target the row had to cut. `tool` holds the command,
   * the path, the pattern or the URL the call acted on, and those are exactly
   * the values that outrun a transcript column. `nodeText` returns null for a
   * rendered node, which is the honest answer: a title cannot describe an
   * element tree, and a wrong one is worse than none.
   */
  const toolTitle = nodeText(tool) ?? undefined;

  return (
    <span className={sx(toolRunStyles.summary, xstyle)}>
      <span className={sx(toolRunStyles.primary)}>
        <span className={sx(agentSurface.rowLabel, toolRunStyles.title)}>
          {title}
        </span>
        {quiet ? (
          <VisuallyHidden>{word}</VisuallyHidden>
        ) : (
          <span
            className={sx(
              toolRunStyles.statusWord,
              agentStatusWord[statusWordTone(status)],
            )}
          >
            {loaderVariant ? (
              <Loader
                aria-hidden
                size="xs"
                tone="inherit"
                variant={loaderVariant}
              />
            ) : null}
            {word}
          </span>
        )}
      </span>
      {tool != null || count != null || elapsedText ? (
        <span className={sx(toolRunStyles.secondary)}>
          {tool ? (
            <span
              className={sx(agentSurface.meta, toolRunStyles.tool)}
              title={toolTitle}
            >
              {tool}
            </span>
          ) : null}
          {count != null ? (
            <span
              className={sx(agentSurface.meta, toolRunStyles.secondaryMeta)}
            >
              {count}
            </span>
          ) : null}
          {elapsedText ? (
            <span
              className={sx(agentSurface.meta, toolRunStyles.secondaryMeta)}
            >
              {elapsedText}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export type ToolRunSectionProps = {
  children: React.ReactNode;
  /** Recolors the section and announces the content assertively. */
  danger?: boolean;
  label: React.ReactNode;
  /** Keeps the public controlled-open contract aligned with `ToolRun`. */
  open: boolean;
} & XstyleProp;

/**
 * One block of payload: arguments, output, a log tail.
 *
 * The parent disclosure already supplies containment. Sections add only a
 * label and spacing; the danger branch adds a semantic wash, never a nested
 * perimeter. A bordered inner panel here is what made the third and fourth
 * concentric border in a reasoning → tool call → output stack.
 *
 * `role="group"` with a labelled heading span, rather than `<section
 * aria-label>`: a section with a name is a landmark, and forty landmarks in a
 * transcript is a worse navigation experience than none.
 */
export function ToolRunSection({
  children,
  danger = false,
  label,
  open,
  xstyle,
}: ToolRunSectionProps) {
  const labelId = React.useId();

  return (
    <div
      aria-labelledby={labelId}
      className={sx(
        toolRunStyles.section,
        open && toolRunStyles.wellOpen,
        danger && toolRunStyles.wellDanger,
        xstyle,
      )}
      role="group"
    >
      <span className={sx(toolRunStyles.sectionLabel)} id={labelId}>
        {label}
      </span>
      <div
        className={sx(toolRunStyles.sectionContent)}
        {...(danger ? { role: "alert" as const } : null)}
      >
        {children}
      </div>
    </div>
  );
}
