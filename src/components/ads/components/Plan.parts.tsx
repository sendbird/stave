import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { sx, type XstyleProp } from "../utils/stylex";
import { Loader } from "./Loader";
import { VisuallyHidden } from "./VisuallyHidden";

/**
 * The five states a durable plan step can be in.
 *
 * Deliberately smaller than `agent-state.ts`'s thirteen-value `AgentRunState`.
 * That union is a *run* lifecycle (queued, checkpointed, resumed, interrupted,
 * …) and a plan step has no use for eight of its values; carrying them would
 * force every consumer to answer "what does a checkpointed plan step look
 * like?" for a state a plan cannot produce.
 *
 * `approval` is the one value borrowed back from that union, under the same
 * name so the two cannot drift. A plan step whose tool run is gated on a human
 * decision is genuinely a fifth state: it is not `pending` (nothing is queued
 * — the agent is *blocked*, and the thing unblocking it is the reader), not
 * `running` (no work is happening), and not `failed` (nothing went wrong).
 * Rendering it as `pending` with the reason in `detail` puts the one step that
 * needs the reader in the same ink as the eleven that do not.
 */
export type PlanStepStatus =
  | "pending"
  | "running"
  | "approval"
  | "done"
  | "failed";

export const planStatusLabel: Record<PlanStepStatus, string> = {
  approval: "Awaiting approval",
  done: "Done",
  failed: "Failed",
  pending: "Pending",
  running: "Running",
};

export type PlanStepItem = {
  /** Secondary prose under the title. Rung 0, muted ink. */
  detail?: React.ReactNode;
  id: string;
  /**
   * What a screen reader should call this step when it changes. Only needed
   * when `title` is not a string; otherwise the title is the name.
   */
  label?: string;
  /** A machine value for this step — an elapsed time, a file count. */
  meta?: React.ReactNode;
  status?: PlanStepStatus;
  /** Nested work. Rendered at rung 1 or rung 2, never as a nested card. */
  steps?: readonly PlanStepItem[];
  title: React.ReactNode;
};

// ---------------------------------------------------------------------------
// The morphing status mark
// ---------------------------------------------------------------------------

/**
 * One 16px mark that carries pending → approval → done → failed as a **morph
 * inside a single SVG**, not as four swapped icons: the ring is always
 * painted, the alert, the check and the cross cross-fade over it, and the
 * whole mark walks the ink ramp (`colorTextSubtle` → `colorWarning` →
 * `colorSuccess` → `colorDanger`). Because the ring never unmounts, the mark
 * keeps its identity across a state change — the eye tracks one object filling
 * in rather than four objects replacing each other, which is the difference
 * between a plan that settles and one that flickers.
 *
 * `approval` takes `colorWarning`, the same semantic weight
 * `agentStateTone.approval` gives it and the same one `Approval` itself
 * signals with. It is ink on a glyph and a word on the row — never a wash
 * behind the step: a tinted band for one row in a rung-3 list is the card this
 * family was rebuilt to remove, and it would out-shout the running step beside
 * it.
 *
 * `running` is the one state that swaps the element, and it swaps in
 * the general `Loader`. A plan step is product chrome, not a branded loading
 * moment, and shares the same reduced-motion contract as buttons and tools.
 *
 * The mark is always `aria-hidden`. Status reaches assistive tech twice, in
 * the two places it is actually useful: as static text on the row (so reading
 * the plan reads the states) and through the plan's own delta announcer (so a
 * change is heard once, named). A `role="status"` per glyph — which is what
 * `Loader` carries by default — would announce "Loading" for every
 * running step on every re-render.
 */
export function PlanStatusMark({
  status,
  xstyle,
}: { status: PlanStepStatus } & XstyleProp) {
  if (status === "running") {
    return (
      <span aria-hidden className={sx(markStyles.slot, xstyle)}>
        <Loader aria-hidden label="Running" size="xs" tone="neutral" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={sx(
        markStyles.slot,
        markStyles[status],
        transition.colors,
        xstyle,
      )}
    >
      <svg
        fill="none"
        height={MARK_BOX}
        viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}
        width={MARK_BOX}
      >
        <circle
          cx="8"
          cy="8"
          r="6.25"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {/*
         * Awaiting approval: a stem and a dot inside the ring the other states
         * already draw. An alert glyph rather than a pause bar or a clock — a
         * gated step is not "paused" (nothing resumes on its own) and it is not
         * "slow"; it is waiting on the person reading the plan, and the alert
         * is the only one of the three that says so. Two subpaths in one `d`,
         * so the fade is one element and one opacity like its siblings.
         */}
        <path
          className={sx(
            markStyles.overlay,
            transition.fade,
            status === "approval" && markStyles.overlayShown,
          )}
          d="M8 4.6V8.4M8 11.05h0.01"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.75"
        />
        <path
          className={sx(
            markStyles.overlay,
            transition.fade,
            status === "done" && markStyles.overlayShown,
          )}
          d="M4.9 8.3 7 10.4 11.1 5.9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          className={sx(
            markStyles.overlay,
            transition.fade,
            status === "failed" && markStyles.overlayShown,
          )}
          d="M5.9 5.9 10.1 10.1M10.1 5.9 5.9 10.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.75"
        />
      </svg>
    </span>
  );
}

const MARK_BOX = 16;

const markStyles = stylex.create({
  slot: {
    alignItems: "center",
    display: "inline-flex",
    inlineSize: MARK_BOX,
    justifyContent: "center",
  },
  // `currentColor` is set as an SVG attribute on the shapes and the semantic
  // ink lives on the slot, so one colour declaration transitions the whole
  // mark instead of three.
  overlay: {
    opacity: 0,
  },
  overlayShown: {
    opacity: 1,
  },
  pending: {
    color: vars.colorTextSubtle,
  },
  approval: {
    color: vars.colorWarning,
  },
  done: {
    color: vars.colorSuccess,
  },
  failed: {
    color: vars.colorDanger,
  },
});

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

/** One flattened step, in reading order, with the name it is announced under. */
export type PlanStepSnapshot = {
  id: string;
  name: string;
  status: PlanStepStatus;
};

/**
 * Depth-first walk in reading order. `path` names an unnamed step by its
 * position ("Step 2.1"), so a caller who passes an element title still gets a
 * usable announcement instead of "undefined: done".
 */
export function flattenPlan(
  steps: readonly PlanStepItem[],
  path: readonly number[] = [],
): PlanStepSnapshot[] {
  const flat: PlanStepSnapshot[] = [];

  steps.forEach((step, index) => {
    const here = [...path, index + 1];
    flat.push({
      id: step.id,
      name:
        step.label ??
        (typeof step.title === "string"
          ? step.title
          : `Step ${here.join(".")}`),
      status: step.status ?? "pending",
    });
    if (step.steps && step.steps.length > 0) {
      flat.push(...flattenPlan(step.steps, here));
    }
  });

  return flat;
}

/**
 * Builds the sentence for one tick of a plan.
 *
 * The rule the whole live-update design turns on: **announce the delta, never
 * the plan.** Putting `aria-live` on the step list makes every status change
 * re-read all seven steps, which at one change per second is a screen reader
 * that never finishes a sentence. So this names only the steps that actually
 * moved, caps the list at two so a batch update stays a sentence, and closes
 * with the completion count — the one number a reader wants after any change.
 *
 * Returns `""` when nothing changed, which is the common case: React re-renders
 * a plan far more often than a plan moves.
 */
export function describePlanDelta(
  previous: ReadonlyMap<string, PlanStepStatus>,
  next: readonly PlanStepSnapshot[],
  done: number,
  total: number,
): string {
  const moved: PlanStepSnapshot[] = [];
  let added = 0;
  const nextIds = new Set(next.map((step) => step.id));
  let removed = 0;

  for (const step of next) {
    const before = previous.get(step.id);
    if (before === undefined) {
      added += 1;
    } else if (before !== step.status) {
      moved.push(step);
    }
  }

  for (const id of previous.keys()) {
    if (!nextIds.has(id)) removed += 1;
  }

  if (moved.length === 0 && added === 0 && removed === 0) return "";

  const sentences: string[] = [];

  for (const step of moved.slice(0, 2)) {
    sentences.push(
      `${step.name}: ${planStatusLabel[step.status].toLowerCase()}`,
    );
  }
  if (moved.length > 2) {
    sentences.push(`and ${moved.length - 2} more steps changed`);
  }
  if (added > 0) {
    sentences.push(added === 1 ? "1 step added" : `${added} steps added`);
  }
  if (removed > 0) {
    sentences.push(
      removed === 1 ? "1 step removed" : `${removed} steps removed`,
    );
  }
  if (total > 0) {
    sentences.push(`${done} of ${total} complete`);
  }

  return `${sentences.join(". ")}.`;
}

/**
 * A polite live region that re-announces identical text.
 *
 * Two alternating slots, because a live region whose text does not change
 * emits nothing — and "Run migrations: done" is exactly the message a plan
 * sends twice in a row when two steps finish the same way. The mount guard is
 * the same one `Thread` uses: a plan that renders with three steps already
 * finished must not read its own backlog aloud.
 */
export function usePlanAnnouncer(enabled: boolean) {
  const [slots, setSlots] = React.useState<readonly [string, string]>(["", ""]);
  const slotRef = React.useRef(0);

  const announce = React.useCallback(
    (message: string) => {
      if (!enabled || message.length === 0) return;
      const slot = slotRef.current;
      slotRef.current = slot === 0 ? 1 : 0;
      setSlots(slot === 0 ? [message, ""] : ["", message]);
    },
    [enabled],
  );

  const region = (
    <>
      <VisuallyHidden aria-atomic="true" aria-live="polite">
        {slots[0]}
      </VisuallyHidden>
      <VisuallyHidden aria-atomic="true" aria-live="polite">
        {slots[1]}
      </VisuallyHidden>
    </>
  );

  return { announce, region };
}
