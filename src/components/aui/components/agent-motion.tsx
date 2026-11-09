import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { useAtelierMotion } from "../motion/useAtelierMotion";
import { agentMotion } from "../recipes/agent-motion";
import { motionDurations, motionEaseInOutCss } from "../tokens/motion-presets";
import { cx, sx, type XstyleProp } from "../utils/stylex";

/**
 * React halves of `recipes/agent-motion.ts`: the pieces of the agent motion
 * language that need to remember the previous render — which items just
 * arrived, which glyph or label was showing a moment ago, whether a state
 * actually changed. Shared by every agent surface; internal to AUI.
 */

/**
 * Reduced motion for the JS half of the agent motion layer. The keyframes
 * live in CSS, which follows `prefers-reduced-motion` and ignores the docs
 * force-play override; the WAAPI glides and exit copies here must end in the
 * same frame as those keyframes, so the media query wins over force-play.
 */
function useAgentReducedMotion(): boolean {
  const { reduceMotion } = useAtelierMotion();
  if (reduceMotion) return true;
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * How many times `value` has changed since mount. `0` on the first render, so
 * a surface that mounts in its final state does not replay a "this changed"
 * cue; each later change bumps it, and the count doubles as a remount key that
 * restarts a one-shot animation.
 */
export function useChangeCount(value: unknown): number {
  const [state, setState] = React.useState({ count: 0, value });
  if (!Object.is(state.value, value)) {
    const next = { count: state.count + 1, value };
    setState(next);
    return next.count;
  }
  return state.count;
}

/**
 * Stagger ranks for a keyed list. Items present on the first render rank by
 * position; items that arrive later rank among the batch they arrived with,
 * so a step appended to a 20-step plan enters at once instead of waiting
 * twenty stagger steps. Ranks are stable while an item stays in the list.
 */
export type AgentArrivalRank = (id: React.Key) => number;

export function useArrivalRank(ids: readonly React.Key[]): AgentArrivalRank {
  const ranks = React.useRef<Map<React.Key, number> | null>(null);
  if (ranks.current === null) {
    ranks.current = new Map(ids.map((id, index) => [id, index]));
  } else {
    const known = ranks.current;
    // Forget items that left, so one that returns (a re-expanded branch)
    // ranks with its new batch instead of its old position.
    const present = new Set(ids);
    for (const id of known.keys()) if (!present.has(id)) known.delete(id);
    let batch = 0;
    for (const id of ids) {
      if (!known.has(id)) {
        known.set(id, batch);
        batch += 1;
      }
    }
  }
  const map = ranks.current;
  return (id) => map.get(id) ?? 0;
}

const EntranceScope = React.createContext(false);

/**
 * Marks a subtree whose container already animates each item's arrival (a
 * `ToolRun.Group` list, a Plan's steps). Leaf components inside it skip their
 * own entrance, so one row never rises twice.
 */
export function AgentEntranceScope({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EntranceScope.Provider value={true}>{children}</EntranceScope.Provider>
  );
}

/** `true` when this component should play its own entrance. */
export function useSelfEntrance(): boolean {
  return !React.useContext(EntranceScope);
}

type LeavingState = { key: number; node: React.ReactNode } | null;

/**
 * Remember the previous children for one exit beat after `swapKey` changes.
 * Under reduced motion there is no exit beat: the old node is dropped at once.
 */
function useLeaving(
  swapKey: React.Key | null | undefined,
  children: React.ReactNode,
  exitMs: number,
) {
  const reduceMotion = useAgentReducedMotion();
  const count = useChangeCount(swapKey);
  const last = React.useRef<{ count: number; node: React.ReactNode }>({
    count,
    node: children,
  });
  const [leaving, setLeaving] = React.useState<LeavingState>(null);

  if (last.current.count !== count) {
    const previous = last.current.node;
    last.current = { count, node: children };
    if (!reduceMotion) setLeaving({ key: count, node: previous });
  } else {
    last.current.node = children;
  }

  React.useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), exitMs);
    return () => window.clearTimeout(timer);
  }, [exitMs, leaving]);

  return { count, leaving };
}

export type AgentGlyphSwapProps = {
  children: React.ReactNode;
  /**
   * Identity of the glyph, usually the run state. When it changes after
   * mount, the old glyph shrinks away while the new one grows in.
   */
  swapKey: React.Key;
} & XstyleProp;

/**
 * A status mark that changes shape (spinner to check, check to cross). The
 * old and new glyph share one grid cell, so the row never shifts; the new one
 * grows from 70% as the old one shrinks out, without overshoot. Purely
 * visual: the state's word or live region still carries the meaning.
 */
export function AgentGlyphSwap({
  children,
  swapKey,
  xstyle,
}: AgentGlyphSwapProps) {
  const { count, leaving } = useLeaving(
    swapKey,
    children,
    motionDurations.quick * 1000,
  );
  return (
    <span className={sx(styles.stack, xstyle)}>
      {leaving ? (
        <span
          aria-hidden
          className={sx(styles.cell, agentMotion.glyphOut)}
          key={`out-${leaving.key}`}
        >
          {leaving.node}
        </span>
      ) : null}
      <span
        className={sx(styles.cell, count > 0 && agentMotion.glyphIn)}
        key={`in-${count}`}
      >
        {children}
      </span>
    </span>
  );
}

export type AgentTextSwapProps = {
  children: React.ReactNode;
  /**
   * Identity of the label. Defaults to the text itself when `children` is a
   * string or number; pass one for a node label, or the swap never plays.
   */
  swapKey?: React.Key;
  /**
   * Let the label give way with an ellipsis inside a constrained cell (a
   * current-step line). Off by default: a status word in a chip keeps its
   * full width, so the chip never truncates its word.
   */
  truncate?: boolean;
} & XstyleProp;

/**
 * A label that cross-fades in place when it changes: the old text fades out
 * and the new text fades in in the same grid cell, with no travel. The box
 * takes the new width once the old copy is gone. The leaving copy is
 * `aria-hidden`, so the label is read once. Reduced motion swaps the text.
 */
export function AgentTextSwap({
  children,
  swapKey,
  truncate = false,
  xstyle,
}: AgentTextSwapProps) {
  const key =
    swapKey ??
    (typeof children === "string" || typeof children === "number"
      ? String(children)
      : null);
  const { count, leaving } = useLeaving(
    key,
    children,
    motionDurations.quick * 1000,
  );
  return (
    <span
      className={sx(styles.text, truncate && styles.textTruncate, xstyle)}
    >
      {leaving ? (
        <span
          aria-hidden
          className={sx(
            styles.cell,
            styles.textCell,
            truncate && styles.textCellTruncate,
            agentMotion.textOut,
          )}
          key={`out-${leaving.key}`}
        >
          {leaving.node}
        </span>
      ) : null}
      <span
        className={sx(
          styles.cell,
          styles.textCell,
          truncate && styles.textCellTruncate,
          count > 0 && agentMotion.textIn,
        )}
        key={`in-${count}`}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * The one-shot tint for a step that is (newly) current. Render it inside a
 * host composed with `agentMotion.layerHost`; change `highlightKey` (or mount
 * it) to play it again.
 */
export function AgentHighlight({ highlightKey }: { highlightKey?: React.Key }) {
  return (
    <span aria-hidden className={sx(agentMotion.highlight)} key={highlightKey} />
  );
}

/**
 * A one-shot ring for a node whose `pulseKey` (its state) just changed. Place
 * inside a positioned host; renders nothing until the first change.
 */
export function AgentPulse({ pulseKey }: { pulseKey: React.Key }) {
  const count = useChangeCount(pulseKey);
  if (count === 0) return null;
  return <span aria-hidden className={sx(agentMotion.pulse)} key={count} />;
}

const styles = stylex.create({
  stack: {
    display: "inline-grid",
    placeItems: "center",
  },
  cell: {
    gridArea: "1 / 1",
    minInlineSize: 0,
  },
  // `clip` is not a scroll container, so the box keeps its content-based
  // minimum unless the caller opts into truncation.
  text: {
    display: "inline-grid",
    maxInlineSize: "100%",
    overflow: "clip",
  },
  textTruncate: {
    minInlineSize: 0,
  },
  // No overflow on the cell by default: an overflowing grid item's minimum
  // contribution is 0, which would squeeze a chip's word to an ellipsis.
  textCell: {
    minInlineSize: "auto",
    whiteSpace: "nowrap",
  },
  textCellTruncate: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
});

/**
 * FLIP for a reordered list: children of `containerRef` carrying
 * `data-flip-key` glide from where they were to where they are (Web
 * Animations `translate`, 250ms on the strong in-out — movement the system
 * starts that begins and ends on screen) whenever `orderKey` changes —
 * an answered question sinking below the open ones, a re-sorted attempt.
 * Items that only mounted or unmounted are left to their own entrance.
 * Reduced motion: the list simply re-renders in its new order.
 */
export function useFlipReorder(
  containerRef: React.RefObject<HTMLElement | null>,
  orderKey: string,
) {
  const reduceMotion = useAgentReducedMotion();
  // Layout tops (offsetTop ignores an in-flight translate) from the last
  // commit — the "first" frame of the next reorder.
  const tops = React.useRef(new Map<string, number>());
  const lastOrder = React.useRef(orderKey);
  const running = React.useRef<Animation[]>([]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reordered = lastOrder.current !== orderKey;
    lastOrder.current = orderKey;
    if (reordered) {
      for (const animation of running.current) animation.cancel();
      running.current = [];
    }
    const next = new Map<string, number>();
    for (const item of container.querySelectorAll<HTMLElement>(
      "[data-flip-key]",
    )) {
      const key = item.dataset.flipKey ?? "";
      const top = item.offsetTop;
      next.set(key, top);
      const previous = tops.current.get(key);
      if (
        !reordered ||
        reduceMotion ||
        previous === undefined ||
        Math.abs(previous - top) < 1 ||
        typeof item.animate !== "function"
      ) {
        continue;
      }
      running.current.push(
        item.animate(
          [{ translate: `0 ${previous - top}px` }, { translate: "0 0" }],
          {
            duration: motionDurations.emphasis * 1000,
            easing: motionEaseInOutCss,
          },
        ),
      );
    }
    tops.current = next;
  });
}
