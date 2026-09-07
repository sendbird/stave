import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { agentStatusWord, agentSurface } from "../recipes/agent-surface";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  PlanStatusMark,
  describePlanDelta,
  flattenPlan,
  planStatusLabel,
  usePlanAnnouncer,
  type PlanStepItem,
  type PlanStepStatus,
} from "./Plan.parts";
import { VisuallyHidden } from "./VisuallyHidden";

export type { PlanStepItem, PlanStepStatus } from "./Plan.parts";

/** How a step's children are held. `rail` keeps the legacy name but uses a quiet inset wash. */
export type PlanSubsteps = "indent" | "rail";

export type PlanProps = Omit<React.ComponentProps<"section">, "title"> & {
  /**
   * Announce status changes in the plan's own polite live region.
   * @default true
   */
  announce?: boolean;
  /** Replaces the default blank slate. */
  emptyState?: React.ReactNode;
  steps?: readonly PlanStepItem[];
  /** @default "indent" */
  substeps?: PlanSubsteps;
  /** @default "Plan" */
  title?: React.ReactNode;
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
 * A derived bar was considered and dropped. ADS `Meter` is the right primitive
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
  announce = true,
  className,
  emptyState,
  steps = NO_STEPS,
  substeps = "indent",
  title = "Plan",
  xstyle,
  ...props
}: PlanProps) {
  const titleId = `${React.useId()}title`;
  const flat = React.useMemo(() => flattenPlan(steps), [steps]);
  const total = steps.length;
  // Top-level steps only. A plan's completion count has to match the list the
  // reader is looking at; counting nested leaves as well makes "3 of 12" a
  // number that appears nowhere on screen.
  const done = steps.filter((step) => step.status === "done").length;

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

  return (
    <section
      {...props}
      aria-labelledby={titleId}
      className={cx(sx(agentSurface.bare, styles.root, xstyle), className)}
      // `group`, not `region`: a long transcript can hold several plans, and a
      // landmark per plan makes the landmark list useless.
      role="group"
    >
      <div className={sx(agentSurface.metaRow, styles.header)}>
        <span
          className={sx(agentSurface.metaRowLabel, styles.title)}
          id={titleId}
        >
          {title}
        </span>
        {total === 0 ? null : (
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
              {done} of {total} steps complete
            </VisuallyHidden>
          </>
        )}
      </div>

      {total === 0 ? (
        (emptyState ?? (
          <p className={sx(styles.empty)}>
            No steps yet. The plan appears once the agent commits to one.
          </p>
        ))
      ) : (
        <ol className={sx(agentSurface.rowGroup, styles.list)}>
          {steps.map((step, index) => (
            <PlanStepRow
              depth={0}
              first={index === 0}
              item={step}
              key={step.id}
              substeps={substeps}
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
  first,
  item,
  substeps,
}: {
  depth: number;
  first: boolean;
  item: PlanStepItem;
  substeps: PlanSubsteps;
}) {
  const status = item.status ?? "pending";
  const nested = item.steps ?? NO_STEPS;
  const top = depth === 0;

  return (
    <li
      className={sx(
        agentSurface.row,
        styles.step,
        // Rung 3 belongs to the top level only. A second tier of hairlines
        // inside an already-indented list reads as table ruling.
        top && agentSurface.rowGroupItem,
        top && first && agentSurface.rowGroupItemFirst,
        !top && styles.substep,
      )}
    >
      <span className={sx(styles.markCell)}>
        <PlanStatusMark status={status} />
      </span>
      <span className={sx(styles.stepTitle)}>
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
            className={sx(styles.statusWord, agentStatusWord.warning)}
            data-plan-step-status="approval"
          >
            {planStatusLabel.approval}
          </span>
        ) : (
          <VisuallyHidden>{`, ${planStatusLabel[status]}`}</VisuallyHidden>
        )}
      </span>
      {item.meta == null ? null : (
        <span className={sx(agentSurface.meta, styles.metaCell)}>
          {item.meta}
        </span>
      )}
      {item.detail == null ? null : (
        <span className={sx(styles.detail)}>{item.detail}</span>
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
        >
          {nested.map((child, index) => (
            <PlanStepRow
              depth={depth + 1}
              first={index === 0}
              item={child}
              key={child.id}
              substeps={substeps}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

// One title line box. The mark and the machine value are centred inside a cell
// of exactly this height, which is what pins them to the title's FIRST line
// rather than to the middle of a wrapped one.
const TITLE_LINE = `calc(${vars.fontSizeBody} * ${vars.lineHeightTight})`;

const styles = stylex.create({
  root: {
    gap: vars.space8,
  },
  header: {
    // Matches `agentSurface.row`'s inline padding so the plan title sits in the
    // same column as the step titles below it.
    paddingInline: vars.space12,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    // §3: medium for a row/section title. Semibold is the page-title weight.
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
  },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  step: {
    alignItems: "start",
    columnGap: vars.space12,
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    rowGap: 0,
  },
  substep: {
    // No rule and no radius; the inset (or the parent's spine) is the whole
    // containment. Tighter block padding keeps a nested run denser than the
    // top-level rows it belongs to.
    paddingBlock: vars.space4,
    paddingInline: 0,
  },
  markCell: {
    alignItems: "center",
    blockSize: TITLE_LINE,
    display: "inline-flex",
    gridColumn: "1",
    gridRow: "1",
    justifyContent: "center",
  },
  /**
   * The visible status word for the one attention state. Tertiary type size,
   * medium weight, colour from `agentStatusWord` — no fill, no border, no dot,
   * exactly the one-colored-word anatomy `ToolRun` uses for the same job. It
   * sits *inside* the title cell so it wraps with the sentence it annotates
   * rather than fighting the machine value in column 3 for the row's width.
   */
  statusWord: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    marginInlineStart: vars.space8,
    whiteSpace: "nowrap",
  },
  stepTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gridColumn: "2",
    gridRow: "1",
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  metaCell: {
    alignItems: "center",
    blockSize: TITLE_LINE,
    display: "inline-flex",
    gridColumn: "3",
    gridRow: "1",
    whiteSpace: "nowrap",
  },
  detail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    gridColumn: "2 / -1",
    gridRow: "2",
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space4,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  substepList: {
    display: "grid",
    gridColumn: "2 / -1",
    gridRow: "3",
    listStyle: "none",
    margin: 0,
    marginBlockStart: vars.space4,
    minInlineSize: 0,
    padding: 0,
  },
  substepRail: {
    backgroundColor: `color-mix(in oklab, ${vars.colorSurfaceTint} 72%, transparent)`,
    borderRadius: vars.radiusControl,
    gap: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
});
