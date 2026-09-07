import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { useLiveEdgeFollow } from "./Thread.liveEdge";

/**
 * Which edges fade. `top` is the streaming shape (there is nothing below the
 * live edge to hint at), `both` the settled one, `none` for a caller that
 * paints its own boundary.
 */
export type CappedViewportEdge = "both" | "none" | "top";

export type CappedViewportProps = React.ComponentProps<"div"> & {
  /**
   * Which edges fade. Defaults to `top` while `live`, `both` once settled —
   * see the component note.
   */
  edge?: CappedViewportEdge;
  /** Accessible name for the log region. */
  label?: string;
  /**
   * Whether growth pins the viewport to the newest content. Only read while
   * `live`. @default true
   */
  follow?: boolean;
  /**
   * The content is still arriving. Switches on the live-edge follow and sets
   * `aria-busy`. @default false
   */
  live?: boolean;
  /**
   * The cap. A number is px. `220` is the measured ceiling for a payload that
   * a reader scans rather than reads: tall enough for ~11 lines of body copy
   * at `lineHeightNormal`, short enough that the row above it stays on screen.
   * @default 220
   */
  maxBlockSize?: number | string;
} & XstyleProp;

/**
 * A bounded, edge-faded scroll region for a payload that has no bound of its
 * own — a growing chain of thought, a command's output, a log tail.
 *
 * **Why this is a component and not `overflow: auto` at each call site.** Three
 * things have to be true together, and every hand-rolled copy got at most two
 * of them:
 *
 * 1. **The cap belongs to the payload, not to the surface holding it.** Capping
 *    a whole trace pushes the *step rows* off the top, so the row whose label
 *    says "Thinking" fades out and the reader watches an unlabelled column of
 *    prose. The cap goes on the body alone; the row stays pinned.
 * 2. **The fade must not fire before there is overflow.** A box-relative
 *    gradient fades content that is still two lines long, because a two-line
 *    box lies entirely inside the fade band. The mask here is a `maxBlockSize`
 *    -tall layer anchored to the scroll box, so short content lands in the
 *    mask's opaque tail and the fade appears only once the content grows into
 *    the band.
 * 3. **Following the live edge is not `scrollTop = scrollHeight`.** A reader
 *    who nudges up mid-stream must keep their position, and a payload that
 *    *collapses* must not be mistaken for a reader scrolling up. Both are
 *    arithmetic `Thread` already got right, so this composes
 *    `useLiveEdgeFollow` rather than shipping a fourth approximation of it.
 *
 * §5.3 makes layout stability a hard requirement, which is the reason the
 * follow is released by reader intent and never re-taken: "the viewport follows
 * the live edge and hands control back the moment the reader scrolls away."
 *
 * It is a `role="log"` with a polite live region, because unlike a reasoning
 * *trace* — which `Thinking` deliberately does not announce, since re-reading a
 * growing chain of thought on every token is unusable — a capped viewport is
 * used for output whose *arrival* is the information. Callers that hold prose
 * should pass their own `role`.
 */
export function CappedViewport({
  edge,
  label,
  live = false,
  ...props
}: CappedViewportProps) {
  // Two components behind one name, remounted across the transition. The
  // follow hook scrolls to the newest content on mount, which is right for a
  // live payload and wrong for a settled one — a finished thought must open at
  // its first line. Branching on `live` inside one component cannot express
  // that, and a settled payload has no reason to hold a ResizeObserver.
  const resolvedEdge = edge ?? (live ? "top" : "both");

  if (!live) {
    return <CappedBox {...props} edge={resolvedEdge} label={label} />;
  }

  return <LiveCappedBox {...props} edge={resolvedEdge} label={label} />;
}

type CappedBoxProps = Omit<CappedViewportProps, "live"> & {
  edge: CappedViewportEdge;
};

/**
 * The cap reaches CSS twice — once as the box's own `max-block-size`, once as a
 * custom property the mask sizes itself against. Without the second the mask
 * would have to guess the cap, and a mask band that disagrees with the box it
 * masks is the "faded before it overflows" bug in a new place.
 */
function capStyle(
  maxBlockSize: number | string,
  style: React.CSSProperties | undefined,
): React.CSSProperties {
  return {
    maxBlockSize,
    [CAP_VAR]:
      typeof maxBlockSize === "number" ? `${maxBlockSize}px` : maxBlockSize,
    ...style,
  } as React.CSSProperties;
}

function CappedBox({
  children,
  className,
  edge,
  follow: _follow,
  label,
  maxBlockSize = DEFAULT_MAX_BLOCK_SIZE,
  style,
  xstyle,
  ...props
}: CappedBoxProps) {
  return (
    <div
      aria-label={label}
      role="log"
      {...props}
      className={cx(sx(styles.root, edgeStyles[edge], xstyle), className)}
      style={capStyle(maxBlockSize, style)}
    >
      {children}
    </div>
  );
}

function LiveCappedBox({
  children,
  className,
  edge,
  follow = true,
  label,
  maxBlockSize = DEFAULT_MAX_BLOCK_SIZE,
  style,
  xstyle,
  ...props
}: CappedBoxProps) {
  const { contentRef, handleScroll, releaseFollow, viewportRef } =
    useLiveEdgeFollow();

  // `follow={false}` is a caller saying "the reader owns this box now" — the
  // same release the scroll listener performs, so it goes through the same
  // path rather than a second flag the arithmetic would have to consult.
  React.useEffect(() => {
    if (!follow) releaseFollow();
  }, [follow, releaseFollow]);

  return (
    <div
      aria-busy="true"
      aria-label={label}
      aria-live="polite"
      role="log"
      {...props}
      className={cx(sx(styles.root, edgeStyles[edge], xstyle), className)}
      onScroll={handleScroll}
      ref={viewportRef as React.Ref<HTMLDivElement>}
      style={capStyle(maxBlockSize, style)}
    >
      <div className={sx(styles.content)} ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

const DEFAULT_MAX_BLOCK_SIZE = 220;

/** The cap, republished to CSS so the mask can be sized against it. */
const CAP_VAR = "--ads-capped-viewport-cap";

/**
 * The fade band. `space16` — the ladder's gutter step — is wide enough to read
 * as a soft boundary and narrow enough that it never hides a whole line.
 *
 * `currentColor` is the opaque stop, matching `Composer`'s liveness mask: a
 * mask reads alpha only, so naming a theme color here would imply the band has
 * a hue it does not have.
 */
const FADE = vars.space16;

/**
 * **Why each fade is a cap-tall layer anchored to the far edge, and not a
 * box-relative gradient.** A box-relative gradient fades content that is still
 * two lines long, because a two-line box lies entirely inside the fade band —
 * the payload looks clipped before anything is clipped.
 *
 * Anchor a `cap`-tall gradient to the *opposite* edge instead and the geometry
 * does the overflow test for free: the transparent end of the layer sits
 * `cap - 16px` away from the anchor, so it is outside the box until the box has
 * actually grown to the cap. Under the cap, content lands in the layer's opaque
 * tail and there is no fade at all.
 */
const topFade = `linear-gradient(to bottom, transparent 0, currentColor ${FADE})`;
const bottomFade = `linear-gradient(to top, transparent 0, currentColor ${FADE})`;
const capSize = `100% var(${CAP_VAR})`;

const edgeStyles = stylex.create({
  none: {},
  top: {
    maskImage: topFade,
    maskPosition: "bottom",
    maskRepeat: "no-repeat",
    maskSize: capSize,
    WebkitMaskImage: topFade,
    WebkitMaskPosition: "bottom",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: capSize,
  },
  /**
   * Two layers intersected, so a settled payload fades at whichever edge it
   * actually overflows. `intersect` is the only composite that means "both
   * masks apply"; `add` would union them back into no mask at all.
   */
  both: {
    maskComposite: "intersect",
    maskImage: `${topFade}, ${bottomFade}`,
    maskPosition: "bottom, top",
    maskRepeat: "no-repeat",
    maskSize: `${capSize}, ${capSize}`,
    WebkitMaskComposite: "source-in",
    WebkitMaskImage: `${topFade}, ${bottomFade}`,
    WebkitMaskPosition: "bottom, top",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: `${capSize}, ${capSize}`,
  },
});

const styles = stylex.create({
  root: {
    minInlineSize: 0,
    overflowX: "hidden",
    overflowY: "auto",
    // The scroll box owns the overscroll: a capped payload inside a transcript
    // must not chain its rubber-band to the transcript's own scroller.
    overscrollBehavior: "contain",
  },
  /**
   * The measured element for the follow hook's `ResizeObserver`. It has no
   * styling of its own on purpose: any padding here would be inside the
   * scroll box and would offset the mask band it is measured against.
   */
  content: {
    minInlineSize: 0,
  },
});
