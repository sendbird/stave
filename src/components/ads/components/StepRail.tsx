import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

/** Inter-step air. `compact` is one deliberate step below `regular`. */
export type StepRailDensity = "compact" | "regular";

/**
 * What the rail publishes to its steps.
 *
 * Both settings are properties of the RUN, not of a step: a rail whose steps
 * disagreed about whether there is a gutter would draw a ragged left edge, and
 * one whose steps disagreed about density would have uneven gaps that read as
 * grouping. Publishing them from the root is what makes that unrepresentable —
 * the same reason `ButtonGroup` owns scale and orientation for its children.
 */
type StepRailContextValue = {
  density: StepRailDensity;
  rail: boolean;
};

/**
 * `null` means "a step outside a rail". `StepRail.Step` is exported through the
 * compound object only, but a consumer can still destructure it, so the defaults
 * below keep that case rendering the documented rail rather than crashing.
 */
const StepRailContext = React.createContext<StepRailContextValue | null>(null);

const DEFAULT_CONTEXT: StepRailContextValue = {
  density: "regular",
  rail: true,
};

export type StepRailProps = React.ComponentProps<"div"> & {
  /**
   * Inter-step air. `compact` halves the trailing pad below each step's body,
   * for a dense transcript where the steps are one-line rows. @default "regular"
   */
  density?: StepRailDensity;
  /**
   * Draw the gutter and its connector. @default true
   *
   * **Turn it off when the steps carry their own leading mark.** The rail earns
   * its column by holding a marker per step; a rail whose steps pass no `marker`
   * is a vertical rule with nothing on it, plus 24px of indent that pushes every
   * row away from the text it belongs to. That is not a cheaper containment
   * signal than nothing, which is what rung 0 asks for — it is chrome. With
   * `rail={false}` the gutter track is not reserved at all (not merely emptied),
   * so the rows sit flush, and a `marker` that IS passed renders inline at the
   * head of the step instead of being dropped.
   */
  rail?: boolean;
} & XstyleProp;

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
function StepRailRoot({
  className,
  density = "regular",
  rail = true,
  xstyle,
  ...props
}: StepRailProps) {
  const context = React.useMemo(() => ({ density, rail }), [density, rail]);

  return (
    <StepRailContext.Provider value={context}>
      <div {...props} className={cx(sx(styles.root, xstyle), className)} />
    </StepRailContext.Provider>
  );
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
  const { density, rail } =
    React.useContext(StepRailContext) ?? DEFAULT_CONTEXT;
  const bodyStyle = density === "compact" ? styles.bodyCompact : styles.body;

  if (!rail) {
    return (
      <div
        {...props}
        className={cx(sx(styles.step, styles.stepFlush, xstyle), className)}
      >
        {/*
         * Inline, not dropped. A caller that passes a marker is naming this
         * step's kind, and a railless rail is still a list of steps; the mark
         * just leads the row instead of standing in a column of its own.
         */}
        {marker != null ? (
          <span className={sx(styles.marker, styles.markerInline)}>
            {marker}
          </span>
        ) : null}
        <div className={sx(bodyStyle)}>{children}</div>
      </div>
    );
  }

  return (
    <div
      {...props}
      className={cx(sx(styles.step, styles.stepRail, xstyle), className)}
    >
      <div className={sx(styles.gutter)}>
        {marker != null ? (
          <span className={sx(styles.marker)}>{marker}</span>
        ) : null}
        {connector ? (
          <span aria-hidden="true" className={sx(styles.connector)} />
        ) : null}
      </div>
      <div className={sx(bodyStyle)}>{children}</div>
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
    inlineSize: "100%",
    minInlineSize: 0,
  },
  // `minmax(0, 1fr)`, not `1fr`: the body holds mono output and long tool
  // names, whose min-content width would otherwise widen the whole rail.
  stepRail: {
    gridTemplateColumns: `${vars.space24} minmax(0, 1fr)`,
  },
  /**
   * No gutter TRACK, not an empty one. Reserving `space24` and leaving it blank
   * indents every row by the width of a column that draws nothing, which is the
   * indent without the containment it was paying for.
   */
  stepFlush: {
    alignItems: "start",
    columnGap: vars.space4,
    // Flex rather than a two-track grid: the marker is optional here, and a
    // fixed `auto minmax(0, 1fr)` would put a marker-less step's body in the
    // `auto` track and shrink it to its content. `display` is restated after
    // `step` in the same `sx()` call, which is the one place StyleX reconciles
    // deterministically.
    display: "flex",
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
   * The railless form of the same box. It keeps the `controlHeightSm` height —
   * that is what centres the mark on the row's first line — and gives up only
   * the gutter's fixed width, so a spinner and a dot still occupy the same
   * vertical band without either one setting the row height.
   */
  markerInline: {
    inlineSize: vars.space16,
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
    flexGrow: 1,
    minInlineSize: 0,
    paddingBlockEnd: vars.space12,
  },
  /**
   * One deliberate step below `regular`, per the density contract in the ADS
   * README: `space12` → `space4`, not zero. At zero the connector's flexible
   * track collapses on a one-line step and the run becomes disconnected dots —
   * the failure the `body` docstring above already names — and the rows lose the
   * gap that separates a step from the next step's title.
   */
  bodyCompact: {
    flexGrow: 1,
    minInlineSize: 0,
    paddingBlockEnd: vars.space4,
  },
});
