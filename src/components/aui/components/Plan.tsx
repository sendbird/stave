import { i18n, useTranslation } from "@/i18n";
import * as React from "react";

import { agentMotion, agentStagger } from "../recipes/agent-motion";
import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  AgentGlyphSwap,
  AgentHighlight,
  useArrivalRank,
  useChangeCount,
  useSelfEntrance,
  type AgentArrivalRank,
} from "./agent-motion";
import {
  PlanStatusMark,
  describePlanDelta,
  flattenPlan,
  planStatusLabel,
  usePlanAnnouncer,
  type PlanStepItem,
  type PlanStepStatus,
} from "./Plan.parts";
import { PlanAppliedNote, PlanNoteRow } from "./Plan.note";
import { planStyles as styles } from "./Plan.styles";
import { VisuallyHidden } from "./VisuallyHidden";

export type { PlanStepItem, PlanStepStatus } from "./Plan.parts";

/** How a step's children are held. `rail` keeps the legacy name but uses a quiet inset wash. */
export type PlanSubsteps = "indent" | "rail";

export type PlanProps = Omit<React.ComponentProps<"section">, "title"> & {
  /** Controls at the end of the header, after the count, such as a toggle that folds finished steps. */
  actions?: React.ReactNode;
  /**
   * Announce status changes in the plan's own polite live region.
   * @default true
   */
  announce?: boolean;
  /**
   * The completion count. Omitted, it counts `steps`. Pass the whole plan's
   * count when `steps` shows only part of it (finished steps folded away), or
   * `false` where a neighbour already states the count.
   */
  count?: false | { done: number; total: number };
  /** Replaces the default blank slate. */
  emptyState?: React.ReactNode;
  steps?: readonly PlanStepItem[];
  /** @default "indent" */
  substeps?: PlanSubsteps;
  /**
   * `row` (default) insets the title and steps 8px, the agent-row edge they
   * share with ToolRun and Thinking rows in a transcript. `flush` puts them on
   * the host's content edge, for a plan composed in a panel beside filled
   * surfaces (an inspector's main column).
   * @default "row"
   */
  inset?: "row" | "flush";
  /** @default "Plan" */
  title?: React.ReactNode;
  /**
   * Keep the title row for assistive tech only — for a plan inside a host
   * that already shows the progress (a `RunMonitor` panel). #809 addition.
   * @default false
   */
  titleHidden?: boolean;
} & XstyleProp;

const NO_STEPS: readonly PlanStepItem[] = [];

/**
 * Durable progress: the steps an agent committed to, and how far through them
 * it is. `Thinking` is the transient half of the same story and disappears;
 * a plan stays readable after the thought that produced it has closed.
 *
 * ## Rung 3 — N steps draw N−1 rules
 *
 * The list is `agentSurface.rowGroup`; each row is `agentSurface.row` plus the
 * group's child-boundary rule. Seven steps therefore draw six hairlines and
 * zero boxes. The plan root itself is `agentSurface.bare`: no fill, no border,
 * no radius, so dropping a plan into a transcript adds no concentric edge.
 *
 * Sub-steps are rung 1 by default — they sit in the parent's title column,
 * held by inset alone. `substeps="rail"` adds a quiet translucent wash for a
 * long nested run where the eye loses the column. The API name is retained for
 * compatibility, but it deliberately paints no side accent or hierarchy line.
 *
 * ## Progress is counted, not estimated
 *
 * The header carries `done / total` in the machine register and nothing else.
 * There is no percentage and no time estimate, because a plan knows how many
 * steps are finished and knows nothing whatever about how long the rest will
 * take (§6). The count is suppressed entirely when there are no steps: `0 / 0`
 * is a progress readout for a thing that has not started, which is the precise
 * kind of false precision the empty state exists to avoid.
 *
 * A derived bar was considered and dropped. AUI `Meter` is the right primitive
 * for one — it is `role="meter"` with real `aria-value*` — but it renders a
 * 10px track *and* a percentage readout, so a plan header would state the same
 * fact in two registers and spend the height of a control on the restatement.
 * A caller who wants the bar can compose `Meter` beside the plan with
 * `value={done} max={total}`; nothing here blocks it.
 *
 * ## Live updates announce the delta, never the plan
 *
 * `aria-live` on the list would re-read all seven steps on every tick. Instead
 * the plan keeps a status snapshot, diffs it, and speaks only what moved plus
 * the new count — see `describePlanDelta`. The first commit is silent, so a
 * plan that mounts half-finished does not narrate its own history.
 */
export function Plan({
  actions,
  announce = true,
  className,
  count,
  emptyState,
  steps = NO_STEPS,
  inset = "row",
  substeps = "indent",
  title = i18n.t("ui:plan.plan"),
  titleHidden = false,
  xstyle,
  ...props
}: PlanProps) {
  useTranslation();
  const titleId = `${React.useId()}title`;
  const flat = React.useMemo(() => flattenPlan(steps), [steps]);
  // Top-level steps only. A plan's completion count has to match the list the
  // reader is looking at; counting nested leaves as well makes "3 of 12" a
  // number that appears nowhere on screen. A caller folding steps away passes
  // the whole plan's count instead.
  // Steering notes ride in the list but are not steps.
  const { done, total } = count || {
    done: steps.filter((step) => step.kind !== "note" && step.status === "done").length,
    total: steps.filter((step) => step.kind !== "note").length,
  };

  const { announce: say, region } = usePlanAnnouncer(announce);
  const seenRef = React.useRef<Map<string, PlanStepStatus> | null>(null);

  React.useEffect(() => {
    const next = new Map(flat.map((step) => [step.id, step.status]));
    const previous = seenRef.current;
    seenRef.current = next;

    // First commit. Every step would read as "added" against an empty
    // snapshot, so a plan rendered with history would announce its backlog.
    if (previous === null) return;

    say(describePlanDelta(previous, flat, done, total));
  }, [done, flat, say, total]);

  const theme = themeProps("plan");
  const arrivalRank = useArrivalRank(steps.map((step) => step.id));
  /*
   * Host: upstream always cascades the steps in. Inside an enclosing
   * `AgentEntranceScope` the plan's arrival is already owned — or, in the chat
   * transcript, deliberately suppressed (see `ChatPanel`): that list is
   * virtualized, so a plan remounts on every scroll and `useArrivalRank` would
   * rank (and replay) every step again. State-change motion (the glyph swap,
   * a highlight or approval word on a real status change) still plays.
   */
  const entrance = useSelfEntrance();

  return (
    <section
      {...props}
      {...theme}
      aria-labelledby={titleId}
      className={cx(
        sx(agentSurface.bare, styles.root, xstyle),
        theme.className,
        className,
      )}
      // `group`, not `region`: a long transcript can hold several plans, and a
      // landmark per plan makes the landmark list useless.
      role="group"
    >
      <div
        className={sx(
          agentSurface.metaRow,
          styles.header,
          inset === "flush" && styles.flush,
          titleHidden && styles.headerOffscreen,
        )}
      >
        <span
          className={sx(agentSurface.metaRowLabel, styles.title)}
          id={titleId}
        >
          {title}
        </span>
        {total === 0 || (count === false && actions == null) ? null : (
          <span className={sx(styles.headerEnd)}>
            {count === false ? null : (
              <>
                {/*
                 * The glyph form is for the eye: tabular figures so the count does
                 * not drag the header sideways as it ticks. The spoken form is a
                 * sentence, because "3 slash 7" is not one.
                 */}
                <span aria-hidden className={sx(agentSurface.meta)}>
                  {done} / {total}
                </span>
                <VisuallyHidden>
                  {i18n.t("ui:plan.progress", { done, total })}
                </VisuallyHidden>
              </>
            )}
            {actions}
          </span>
        )}
      </div>

      {steps.length === 0 ? (
        (emptyState ?? (
          <p className={sx(styles.empty)}>
            {i18n.t("ui:plan.noStepsYetThePlanAppearsOnceTheAgentCommitsToOne")}</p>
        ))
      ) : (
        <ol className={sx(agentSurface.rowGroup, styles.list)} role="list">
          {steps.map((step, index) => (
            <PlanStepRow
              depth={0}
              first={index === 0}
              entrance={entrance}
              item={step}
              key={step.id}
              rank={arrivalRank}
              substeps={substeps}
              xstyle={inset === "flush" ? styles.flush : undefined}
            />
          ))}
        </ol>
      )}

      {/*
       * Mounted from the first commit, always, including while the plan is
       * empty: a live region that appears in the same commit as its first
       * message is routinely missed, because the region must already be in the
       * accessibility tree when the text lands in it.
       */}
      {region}
    </section>
  );
}

/**
 * One step row.
 *
 * ## Everything on the row anchors to the title's FIRST line
 *
 * A step title is a sentence and is allowed to wrap. The grid is therefore
 * `alignItems: start`, and the mark and the machine value are centred inside
 * cells whose height is exactly one title line box
 * (`fontSizeSm × lineHeightTight`) — not inside the row. Centring them in the
 * row is the bug: on a two-line title the mark drifts to the midpoint of the
 * block and stops pointing at the thing it annotates.
 *
 * `detail` and the nested list are placed in explicit later rows of the same
 * grid rather than nested inside a copy cell, for the same reason.
 */
function PlanStepRow({
  depth,
  entrance,
  first,
  item,
  rank,
  substeps,
  xstyle,
}: XstyleProp & {
  depth: number;
  /** Host: `false` inside an `AgentEntranceScope` (the chat transcript). */
  entrance: boolean;
  first: boolean;
  item: PlanStepItem;
  /** Arrival ranks of this row's siblings — the stagger order. */
  rank: AgentArrivalRank;
  substeps: PlanSubsteps;
}) {
  useTranslation();
  const status = item.status ?? "pending";
  const nested = item.steps ?? NO_STEPS;
  const top = depth === 0;
  const childRank = useArrivalRank(nested.map((child) => child.id));
  // `0` on mount: a row that remounts in its final state replays nothing.
  const statusChanged = useChangeCount(status) > 0;
  // Steps (and substeps, within their parent) cascade in on a short stagger;
  // a step appended mid-run enters on its own.
  const enter = entrance
    ? ([agentMotion.enter, agentStagger(rank(item.id))] as const)
    : ([] as const);
  // Mount-played cues (the current-step highlight, the approval word's fade) are
  // state cues; under a suppressed entrance they play only on a real change.
  const stateCue = entrance || statusChanged;

  if (item.kind === "note") {
    return <PlanNoteRow enter={enter} first={first} item={item} top={top} />;
  }

  return (
    <li
      aria-current={item.current ? "step" : undefined}
      className={sx(
        agentSurface.row,
        styles.step,
        // Rung 3 belongs to the top level only. A second tier of hairlines
        // inside an already-indented list reads as table ruling.
        top && agentSurface.rowGroupItem,
        top && first && agentSurface.rowGroupItemFirst,
        !top && styles.substep,
        ...enter,
        status === "running" && agentMotion.layerHost,
        xstyle,
      )}
    >
      {/* The step that just became current is highlighted once. */}
      {status === "running" && stateCue ? <AgentHighlight /> : null}
      <span className={sx(styles.markCell)}>
        <AgentGlyphSwap swapKey={status}>
          <PlanStatusMark status={status} />
        </AgentGlyphSwap>
      </span>
      <span
        {...themeSlotProps("plan", "title")}
        className={sx(styles.stepTitle)}
      >
        {item.title}
        {/*
         * Status as text on the row, so reading the plan reads the states. The
         * mark itself is `aria-hidden`; a live change is spoken once by the
         * plan's announcer instead of by thirteen glyphs.
         *
         * `approval` is the one state that spends a *visible* word, because it
         * is the one state that is a request to the reader — `isAttentionState`
         * calls this the quiet-state rule, and the corollary is that the state
         * asking for an action has to be readable without decoding a glyph
         * (WCAG 1.4.1: colour is not the only channel). Every other state stays
         * screen-reader-only: a column of visible "Done" words is chrome with
         * no information in it, and it would push the meta cell off the row.
         */}
        {status === "approval" ? (
          <span
            className={sx(
              styles.statusWord,
              agentStatusWord.warning,
              stateCue && agentMotion.textIn,
            )}
            data-plan-step-status="approval"
          >
            {planStatusLabel.approval}
          </span>
        ) : (
          <VisuallyHidden>{`, ${planStatusLabel[status]}`}</VisuallyHidden>
        )}
      </span>
      {item.meta == null ? null : (
        <span
          {...themeSlotProps("plan", "meta")}
          className={sx(agentSurface.meta, styles.metaCell)}
        >
          {item.meta}
        </span>
      )}
      {item.detail == null && item.appliedNote == null ? null : (
        <span className={sx(styles.detail)}>
          {item.detail}
          {item.appliedNote == null ? null : (
            <PlanAppliedNote note={item.appliedNote} />
          )}
        </span>
      )}
      {nested.length === 0 ? null : (
        <ol
          className={sx(
            styles.substepList,
            // Rung 2 only at the first nesting level. Deeper than that, a rail
            // per level is a stack of vertical rules, so depth ≥ 1 always
            // holds its children with inset alone.
            top && substeps === "rail" && styles.substepRail,
          )}
          role="list"
        >
          {nested.map((child, index) => (
            <PlanStepRow
              depth={depth + 1}
              entrance={entrance}
              first={index === 0}
              item={child}
              key={child.id}
              rank={childRank}
              substeps={substeps}
            />
          ))}
        </ol>
      )}
    </li>
  );
}
