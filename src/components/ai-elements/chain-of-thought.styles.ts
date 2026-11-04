import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/*
 * This module used to run a private motion vocabulary: three local
 * `cubic-bezier` constants and raw 150/200/220/250/260ms literals. Every one of
 * them is now a token, per the motion table in `docs/design/turn-events.md`.
 *
 * The mapping, and the two judgement calls in it:
 *
 * - `cubic-bezier(0.2, 0.8, 0.2, 1)` and `cubic-bezier(0.16, 1, 0.3, 1)` were
 *   hand-tuned near-duplicates of `motionEaseStandard`
 *   (`cubic-bezier(0.2, 0, 0, 1)`) and `motionEaseExpressive`
 *   (`cubic-bezier(0.22, 1, 0.36, 1)`). They are gone rather than "kept for
 *   fidelity": a curve nobody can tell apart from the token is a fourth copy of
 *   the token that drifts on the next edit.
 * - `cubic-bezier(0.34, 1.56, 0.64, 1)` overshot past 1. The agent-surface
 *   grammar §5 spends its one attention-taking animation on the composer's
 *   working state and names spring overshoot as a thing reduced motion drops,
 *   so an overshoot on *every* trace row was the wrong place for it. It becomes
 *   `motionEaseExpressive` — the same decelerating arrival without the bounce.
 * - 220ms and 260ms round to `motionDurationEmphasis` (250ms) and 200ms to
 *   `motionDurationNormal` (180ms). 150ms and 250ms and the 2s shimmer loop
 *   were already exactly `motionDurationQuick`, `motionDurationEmphasis` and
 *   `motionDurationLoopSlow`.
 *
 * The reduced-motion arms stay on every key: the tokens carry no media query of
 * their own, so dropping the arm here would re-enable the translation the
 * grammar requires be removed.
 */

/*
 * Local keyframes, replacing the global `@utility animate-*` classes. The
 * `cot-*` / `trace-*` keyframes these were named after are gone from
 * `globals.css`; nothing outside this module references them any more, which is
 * why the matching `cot-trace-content` hook was dropped from the content
 * container rather than being given a definition it never had.
 */
const cotStepIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const traceReveal = stylex.keyframes({
  from: {
    opacity: 0,
    clipPath: "inset(0 0 100% 0)",
    transform: "translateY(-4px)",
  },
  to: {
    opacity: 1,
    clipPath: "inset(0 0 0 0)",
    transform: "translateY(0)",
  },
});

const traceRowIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const thinkingShimmer = stylex.keyframes({
  "0%, 100%": { opacity: 0.5 },
  "50%": { opacity: 1 },
});

const reduced = "@media (prefers-reduced-motion: reduce)";

/*
 * The trace panel's open/close: its row track grows from nothing to its
 * content's height, so the transcript below follows without animating a
 * measured `height`.
 */
const rowTrackOpen = stylex.keyframes({
  from: { gridTemplateRows: "0fr" },
  to: { gridTemplateRows: "1fr" },
});

const rowTrackClose = stylex.keyframes({
  from: { gridTemplateRows: "1fr" },
  to: { gridTemplateRows: "0fr" },
});

const contentFadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const contentFadeOut = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

export const chainOfThoughtStyles = stylex.create({
  root: {
    width: "100%",
  },

  // ── Trigger ──────────────────────────────────────────────────
  /*
   * Composed as `xstyle` on top of ADS `inlineDisclosure.trigger`, which now
   * owns the whole box — the glyph column's inline padding, the block padding,
   * `controlHeightSm`, the radius, the hover/press wash and the focus ring.
   * What stays here is the three things the recipe cannot decide:
   *
   * - **One line.** This header carries a title, a duration and a roll-up.
   *   It never wraps: the title ellipsizes and gives up room first, while
   *   the duration and the counts keep their full width.
   * - **The size.** `em`, not `fontSizeBody`: the trace scales with the user's
   *   message font size, and a fixed-token header inside an `em`-scaled rail
   *   would stop matching the rows under it at any non-default setting.
   * - **The ink.** One step darker than `agentSurface.rowLabel`, which is what
   *   every row *inside* the trace now uses. The container has to outrank its
   *   contents; at the rows' own ink the turn header read as one more row.
   */
  trigger: {
    color: vars["--ads-color-text"],
    flexWrap: "nowrap",
    minWidth: 0,
    fontSize: "0.875em",
  },
  streamingLabel: {
    display: "inline-flex",
    minWidth: 0,
    flexShrink: 1,
    overflow: "hidden",
    whiteSpace: "nowrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  /*
   * The running header's three parts and who gives way first. The phrase and
   * the clock keep their width; the activity starts from a zero basis and
   * grows into the room left, up to its own text, so it is the part that
   * ellipsizes when the row is short. Only once it is gone does the phrase
   * shrink. The clock never does.
   */
  streamingPhrase: {
    flex: "0 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  streamingActivity: {
    flex: "1 1 0",
    minWidth: 0,
    maxWidth: "max-content",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--ads-color-text-muted"],
  },
  streamingElapsed: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  /* The dot between parts, sitting in the activity so it leaves with it. */
  streamingSeparator: {
    color: vars["--ads-color-border"],
    marginInlineEnd: vars["--ads-space-8"],
  },
  completionLabel: {
    minWidth: 0,
    flexShrink: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  /* The machine register, from `agentSurface.meta` at the call site. */
  durationLabel: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  summary: {
    marginLeft: "auto",
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    columnGap: "0.6em",
    whiteSpace: "nowrap",
    fontSize: `max(0.75em, ${vars["--ads-font-size-caption"]})`,
    color: vars["--ads-color-text-muted"],
    animationName: { default: cotStepIn, [reduced]: "none" },
    animationDuration: { default: vars["--ads-motion-duration-normal"], [reduced]: "0ms" },
    animationTimingFunction: vars["--ads-motion-ease-standard"],
  },
  summaryItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
  },
  summaryDivider: { color: vars["--ads-color-border"] },
  summaryItemIcon: {
    display: "inline-flex",
    alignItems: "center",
  },
  // ── Content container ────────────────────────────────────────
  /*
   * `space4`, matching `inlineDisclosure.body`'s own `marginBlockStart`: the
   * trigger now carries block padding of its own, so the old `0.75em` read as
   * a gap between two unrelated blocks rather than a header and its panel.
   */
  content: { marginTop: vars["--ads-space-4"] },
  // ── Open / close ─────────────────────────────────────────────
  /*
   * A one-track grid around the panel. At rest the track is `1fr` and nothing
   * clips, so focus rings and overhanging rows draw as before; while it moves,
   * the body clips to the track and fades. Rows: `motionDurationQuick` on the
   * decelerating `motionEaseExpressive`; content opacity: `motionDurationFast`.
   */
  collapse: {
    display: "grid",
    gridTemplateRows: "1fr",
  },
  collapseEntering: {
    animationName: { default: rowTrackOpen, [reduced]: "none" },
    animationDuration: vars["--ads-motion-duration-quick"],
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    animationFillMode: "both",
  },
  collapseExiting: {
    gridTemplateRows: "0fr",
    animationName: { default: rowTrackClose, [reduced]: "none" },
    animationDuration: vars["--ads-motion-duration-quick"],
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    animationFillMode: "both",
  },
  collapseBody: {
    minHeight: 0,
    minWidth: 0,
  },
  /*
   * A panel the reader toggled opens as one piece, so the per-row entrance
   * (meant for rows arriving while a turn streams) is zeroed for everything
   * inside it. It stays zeroed while mounted: restoring the duration would
   * restart a row's finished entrance part-way through.
   */
  collapseBodyToggled: {
    "--stave-trace-row-entrance": "0s",
  },
  collapseBodyMoving: {
    overflow: "hidden",
  },
  collapseBodyEntering: {
    animationName: { default: contentFadeIn, [reduced]: "none" },
    animationDuration: vars["--ads-motion-duration-fast"],
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    animationFillMode: "both",
  },
  collapseBodyExiting: {
    animationName: { default: contentFadeOut, [reduced]: "none" },
    animationDuration: vars["--ads-motion-duration-fast"],
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    animationFillMode: "both",
  },
  contentTraceMotion: {
    animationName: { default: traceReveal, [reduced]: "none" },
    animationDuration: {
      default: vars["--ads-motion-duration-emphasis"],
      [reduced]: "0ms",
    },
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    transformOrigin: "top",
  },

  // ── Streaming thought viewport ───────────────────────────────
  /*
   * The cap, the mask band and the live-edge follow now belong to ADS
   * `CappedViewport`; what stays here is the one thing the host owns, the
   * reading measure of the prose inside it.
   */
  viewportBody: {
    minWidth: 0,
  },

  // ── Step ─────────────────────────────────────────────────────
  /*
   * Composed as `xstyle` onto ADS `StepRail.Step`, which owns the gutter grid
   * and the connector, so this key carries type and ink only: re-declaring
   * `display` here would replace the rail's grid with a flex row and drop the
   * gutter track the connector lives in.
   */
  step: {
    fontSize: "0.875em",
  },
  stepActive: { color: vars["--ads-color-text"] },
  stepDone: { color: vars["--ads-color-text-muted"] },
  stepPending: {
    color: vars["--ads-color-text-muted"],
  },
  stepMotionRowTrace: {
    animationName: { default: traceRowIn, [reduced]: "none" },
    animationDuration: {
      default: `var(--stave-trace-row-entrance, ${vars["--ads-motion-duration-emphasis"]})`,
      [reduced]: "0ms",
    },
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    transformOrigin: "top",
  },
  contentColumn: {
    minWidth: 0,
  },
  /*
   * `controlHeightSm` on the title row is what puts this row on the same
   * rhythm as the ADS `ToolRun` and `Thinking` rows beside it in the rail.
   */
  disclosure: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    minHeight: vars["--ads-control-height-sm"],
    textAlign: "left",
  },
  disclosureChevron: {
    width: "0.85em",
    height: "0.85em",
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
    transitionProperty: "transform",
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      [reduced]: "0ms",
    },
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  disclosureChevronOpen: { transform: "rotate(180deg)" },
  staticRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    minHeight: vars["--ads-control-height-sm"],
  },
  description: { marginTop: "0.25em", color: vars["--ads-color-text-muted"] },
  reveal: { marginTop: "0.5em" },
  revealMotionTrace: {
    animationName: { default: traceReveal, [reduced]: "none" },
    animationDuration: {
      default: vars["--ads-motion-duration-emphasis"],
      [reduced]: "0ms",
    },
    animationTimingFunction: vars["--ads-motion-ease-expressive"],
    transformOrigin: "top",
  },

  // ── Step icons ───────────────────────────────────────────────
  iconBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.15em",
    height: "1.15em",
  },
  bullet: {
    width: "0.35em",
    height: "0.35em",
    borderRadius: vars["--ads-radius-full"],
  },
  bulletActive: { backgroundColor: vars["--ads-color-text"] },
  bulletIdle: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 50%, transparent)`,
  },
  iconChild: {
    display: "inline-flex",
  },
  iconThinking: {
    color: vars["--ads-color-text"],
    animationName: { default: thinkingShimmer, [reduced]: "none" },
    animationDuration: vars["--ads-motion-duration-loop-slow"],
    animationTimingFunction: vars["--ads-motion-ease-in-out"],
    animationIterationCount: "infinite",
  },
  iconAgent: { color: vars["--ads-color-text"] },
  iconDone: { color: vars["--ads-color-text-muted"] },
  iconPending: {
    color: vars["--ads-color-text-muted"],
  },
  loaderColor: { color: vars["--ads-color-text"] },
  statusIcon: { width: "1.15em", height: "1.15em" },
});
