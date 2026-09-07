import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type StepRailProps = React.ComponentProps<"div"> & XstyleProp;

/**
 * Rung 2 of the containment ladder — `decisions/agent-surface-grammar.md` §1.
 *
 * The ladder names "a hairline in a 16–24px gutter" as the cheapest way to say
 * *these rows are one run of work*, and `agentSurface.indent` (rung 1) already
 * points at it by name. Nothing in the family drew it, so every consumer that
 * needed an ordered run of agent steps hand-rolled the same three-part
 * construction: a fixed gutter, a marker box, and a 1px rule under it. The
 * copies drift in exactly the two places that are load-bearing — the gutter
 * width (which is what aligns the markers of adjacent steps) and whether the
 * rule reaches the next marker (which is what makes the run read as connected
 * rather than as a column of unrelated dots).
 *
 * **It is a rail, not a `Stepper` and not a `Timeline`.** `Stepper` owns a
 * wizard's navigation state and `Timeline` owns dated history; both are
 * components with their own vocabulary. This is the ladder rung underneath
 * them: no state, no data, no ordering opinion. It draws the gutter and the
 * rule and hands its body cell to whatever the step actually is — a `ToolRun`,
 * a `Thinking`, an `Approval`, a paragraph.
 *
 * **The rail height is not animated here, and must not be.** The connector is
 * `flex: 1` inside a stretched gutter, so it takes whatever height the body
 * cell has; when the body is a disclosure the rail follows that panel's own
 * `block-size` transition for free. A second transition on the rail would
 * animate against the panel's and lag behind the marker it connects to.
 */
function StepRailRoot({ className, xstyle, ...props }: StepRailProps) {
  return <div {...props} className={cx(sx(styles.root, xstyle), className)} />;
}

export type StepRailStepProps = React.ComponentProps<"div"> & {
  /**
   * Draws the rule below the marker. Turn it off on the last step: a rule that
   * runs past the final marker points at nothing and reads as truncated
   * content. @default true
   */
  connector?: boolean;
  /**
   * The mark that sits on the rail — a `StatusDot`, an object glyph, a
   * `Loader`. Sized and centred by the gutter, so pass the bare element.
   */
  marker?: React.ReactNode;
} & XstyleProp;

/**
 * One step on the rail: a marker in the gutter, a rule under it, and the step
 * itself in the body cell.
 *
 * The gutter is `space24` wide — the top of the ladder's 16–24px range — and
 * the marker is centred in it, which is the whole alignment contract: two
 * adjacent steps whose markers differ in size (a spinner, then a dot) keep
 * their rule perfectly straight because neither one sets the gutter.
 */
function StepRailStep({
  children,
  className,
  connector = true,
  marker,
  xstyle,
  ...props
}: StepRailStepProps) {
  return (
    <div {...props} className={cx(sx(styles.step, xstyle), className)}>
      <div className={sx(styles.gutter)}>
        {marker != null ? (
          <span className={sx(styles.marker)}>{marker}</span>
        ) : null}
        {connector ? (
          <span aria-hidden="true" className={sx(styles.connector)} />
        ) : null}
      </div>
      <div className={sx(styles.body)}>{children}</div>
    </div>
  );
}

/**
 * `StepRail` ships one compound part per `decisions/composition-api.md`: the
 * step hangs off the rail it belongs to, so a call site cannot place a step
 * outside a rail and get a gutter with no rule in it.
 */
export const StepRail = Object.assign(StepRailRoot, { Step: StepRailStep });

const styles = stylex.create({
  root: {
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  step: {
    columnGap: vars.space8,
    display: "grid",
    // `minmax(0, 1fr)`, not `1fr`: the body holds mono output and long tool
    // names, whose min-content width would otherwise widen the whole rail.
    gridTemplateColumns: `${vars.space24} minmax(0, 1fr)`,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  gutter: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
  },
  /**
   * A `controlHeightSm` box, matching the row height `ToolRun` and `Thinking`
   * give their triggers. That is what puts the marker on the optical centre of
   * the step's first line without a magic offset — the failure the hand-rolled
   * copies papered over with a fractional `margin-block-start`.
   */
  marker: {
    alignItems: "center",
    blockSize: vars.controlHeightSm,
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  /**
   * The rule. `borderWidthHairline` on `colorBorderSubtle`: it locates the run
   * without competing with the markers it connects, and §2 keeps the visible
   * step information in ink rather than in chrome.
   */
  connector: {
    backgroundColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusFull,
    flex: 1,
    inlineSize: vars.borderWidthHairline,
    minBlockSize: 0,
  },
  /**
   * The trailing pad is what gives a one-line step a visible rule at all: with
   * no pad the connector's flexible track collapses to zero and the run
   * becomes disconnected dots.
   */
  body: {
    minInlineSize: 0,
    paddingBlockEnd: vars.space12,
  },
});
