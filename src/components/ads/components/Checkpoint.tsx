import * as stylex from "@stylexjs/stylex";
import { Bookmark, RotateCcw } from "lucide-react";
import * as React from "react";

import { agentSurface } from "../recipes/agent-surface";
import { controlIconSizes } from "../recipes/control-metrics";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button } from "./Button";

export type CheckpointProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** One sentence about what the boundary contains. Wraps; the title does not. */
  description?: React.ReactNode;
  disabled?: boolean;
  /** A machine value — a timestamp, a message count, a commit sha. */
  meta?: React.ReactNode;
  onRestore?: React.MouseEventHandler<HTMLButtonElement>;
  restoreLabel?: React.ReactNode;
  restoringLabel?: string;
  restoring?: boolean;
  title?: React.ReactNode;
} & XstyleProp;

/**
 * A restorable boundary in a long transcript: **a separator with an action,
 * never a card in the stack.** Two hairline rules flank a glyph, a one-line
 * label, a machine value, and a Restore control. It draws no fill, no
 * perimeter, and no radius — the rules are its only ink.
 *
 * ## Every element sits on the title's first line, by construction
 *
 * The rules, the glyph, the title, the machine value, and the action are all
 * children of ONE grid and are all placed in **grid row 1 explicitly**. Row 1
 * is centered (`alignItems: center`), and the title is pinned to a single line,
 * so the title's first line box and its border box share a centre — which makes
 * "the glyph is on the title's line" an identity rather than an observation,
 * at every viewport width, whether or not a description is present, and
 * whatever height the Restore button happens to be.
 *
 * The defect this design removes: the previous generation put the title and the
 * description in a **nested two-row grid inside one centred cell**. The cell,
 * not the title, was what got centred, so adding a description pushed the
 * glyph, the machine value and the action down to the midpoint of the two-line
 * block — measured at **+10.66px below the title's first line box** with a
 * description, and 0 without one, i.e. a layout that was correct only for the
 * data the author happened to preview it with.
 *
 * ## The narrow arm is a chosen order, not auto-flow
 *
 * Below 520px a row cannot hold a label, a machine value and a control without
 * crushing all three, so the last two drop out of row 1 and stack under the
 * copy column in a **fixed, explicit order**: description (what this boundary
 * is), then `meta` (when/how big), then Restore (act on it). Read the thing,
 * then its measurements, then decide — the same order the wide arm reads in
 * left to right. The rows are numbered rather than left to `gridRow: auto`,
 * because auto-flow makes the stacked order a side effect of JSX order and
 * silently reshuffles the moment a part is omitted.
 *
 * `rowGap` is 0 on both arms and the vertical rhythm is paid by each stacked
 * item's own `marginBlockStart`. A numbered row that renders nothing must cost
 * nothing, and an empty grid track still collects the gaps on both sides of it.
 */
export function Checkpoint({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  description,
  disabled,
  meta,
  onRestore,
  restoreLabel = "Restore",
  restoringLabel = "Restoring",
  restoring = false,
  title = "Checkpoint saved",
  xstyle,
  ...props
}: CheckpointProps) {
  const titleId = `${React.useId()}title`;

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      // The visible title IS the name of this boundary, so point at it rather
      // than restating it in an `aria-label` that then goes stale — and that
      // would have to invent a generic fallback exactly when the caller passed
      // an element instead of a string, i.e. when they named it most precisely.
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : titleId)}
      className={cx(sx(styles.root, xstyle), className)}
      // `group`, not `separator`: `role="separator"` is a leaf and would hide
      // the Restore control from assistive tech, and not `region`, because a
      // transcript with twenty checkpoints would publish twenty landmarks.
      role="group"
    >
      <span aria-hidden className={sx(styles.rule, styles.ruleLead)} />
      <span aria-hidden className={sx(styles.glyph)}>
        {/*
         * `Bookmark`, not a `WorkflowIcon`: that family is the issue
         * priority/state glyph set (backlog · in progress · done) and carries
         * ordinal workflow meaning a transcript boundary does not have.
         */}
        <Bookmark size={controlIconSizes.sm} />
      </span>
      <span className={sx(styles.title)} id={titleId}>
        {title}
      </span>
      {description == null ? null : (
        <span className={sx(styles.description)}>{description}</span>
      )}
      {meta == null ? null : (
        <span className={sx(agentSurface.meta, styles.meta)}>{meta}</span>
      )}
      {onRestore == null ? null : (
        <span className={sx(styles.action)}>
          <Button
            disabled={disabled}
            loading={restoring}
            loadingLabel={restoringLabel}
            onClick={onRestore}
            size="sm"
            // Quiet is the right weight beside a hairline: the rules are this
            // component's only drawn edge, and an outline/secondary button
            // would set a second boxed edge a few pixels from them.
            //
            // Deliberately NOT §9's resting-invisible treatment. That is for
            // redundant affordances (copy, retry, open) on a row that reads
            // fine without them; restoring is the entire reason this is a
            // component instead of a `Separator` with a label.
            variant="quiet"
          >
            <RotateCcw aria-hidden size={controlIconSizes.sm} />
            {restoreLabel}
          </Button>
        </span>
      )}
      <span aria-hidden className={sx(styles.rule, styles.ruleTrail)} />
    </div>
  );
}

// Column map, stated once because StyleX needs the literals inline.
//
//   wide    1 rule | 2 glyph | 3 copy | 4 meta | 5 action | 6 rule
//   narrow  1 rule | 2 glyph | 3 copy | 4 rule
//
// Row map, in both arms:
//
//   row 1   rule · glyph · title · (meta) · (action) · rule
//   row 2   description
//   row 3   meta   (narrow only)
//   row 4   action (narrow only)

const styles = stylex.create({
  root: {
    // Every row-1 child is centred in the SAME row, and the title is one line,
    // so the row's centre line is the title's first-line-box centre. This one
    // declaration is what makes the alignment invariant hold; do not move an
    // element out of row 1 without re-measuring.
    alignItems: "center",
    color: vars.colorTextMuted,
    columnGap: vars.space8,
    display: "grid",
    // The outer `1fr`s are the rules; `minmax(0, auto)` lets the copy take the
    // width it needs and shrink to nothing before the grid overflows.
    gridTemplateColumns: "1fr auto minmax(0, auto) auto auto 1fr",
    inlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: vars.space8,
    // Zero, always. Stacked rows pay their own leading (see the class doc), so
    // a numbered row that renders nothing costs nothing.
    rowGap: 0,
    "@media (max-width: 520px)": {
      gridTemplateColumns: "1fr auto minmax(0, auto) 1fr",
    },
  },
  rule: {
    borderBlockStartColor: vars.colorBorderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    gridRow: "1",
    // Floor for both rules. Same flex factor and same floor on both tracks, so
    // they resolve equal at every width and the content run is centred by
    // construction — no width cap involved.
    minInlineSize: vars.space16,
  },
  ruleLead: {
    gridColumn: "1",
  },
  ruleTrail: {
    gridColumn: "6",
    "@media (max-width: 520px)": {
      gridColumn: "4",
    },
  },
  glyph: {
    alignItems: "center",
    color: vars.colorAccent,
    display: "inline-flex",
    gridColumn: "2",
    gridRow: "1",
  },
  // Hierarchy is three tokenized channels at one size, so the component stays
  // inside §3's dense band: ink, weight, and register. `fontWeightMedium` is
  // §3's row-title weight — semibold is reserved for page titles, and a weight
  // jump on top of an ink step is the signal that turns a dense surface loud.
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gridColumn: "3",
    gridRow: "1",
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    // One line, always. A checkpoint title is a boundary label; the description
    // is the part that wraps. This is also the second half of the alignment
    // invariant: with one line the title's first line box and its border box
    // share a centre, and row 1 centres everything on that.
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightRegular,
    gridColumn: "3",
    gridRow: "2",
    lineHeight: vars.lineHeightNormal,
    marginBlockStart: vars.space4,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    "@media (max-width: 520px)": {
      marginBlockStart: vars.space8,
    },
  },
  // Ink, mono and tabular figures come from `agentSurface.meta` — a
  // checkpoint's meta is a machine value, and tabular figures keep a live one
  // from re-flowing the row as it ticks. Only placement is local.
  meta: {
    gridColumn: "4",
    gridRow: "1",
    "@media (max-width: 520px)": {
      gridColumn: "3",
      gridRow: "3",
      marginBlockStart: vars.space8,
    },
  },
  action: {
    display: "inline-flex",
    gridColumn: "5",
    gridRow: "1",
    "@media (max-width: 520px)": {
      gridColumn: "3",
      gridRow: "4",
      // Left-aligned under the copy column rather than stretched: a stacked
      // Restore is still an inline action, not a full-width commit.
      justifySelf: "start",
      marginBlockStart: vars.space8,
    },
  },
});
