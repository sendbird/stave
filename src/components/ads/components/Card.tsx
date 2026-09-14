import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type CardDensity = "compact" | "regular";

export type CardProps = React.ComponentProps<"section"> & {
  /** Spatial scale of the padding. @default "regular" */
  density?: CardDensity;
} & XstyleProp;

/**
 * Bounded content surface (baseline `Card` anatomy). Compose with `CardHeader`
 * (+ `CardTitle` / `CardDescription` / `CardAction`), `CardContent`, and
 * `CardFooter`. It stays flat: the perimeter marks ownership, while elevation
 * remains reserved for pressable or detached surfaces.
 */
export function Card({
  className,
  density = "regular",
  xstyle,
  ...props
}: CardProps) {
  return (
    <section
      {...props}
      className={cx(sx(styles.root, densityStyles[density], xstyle), className)}
    />
  );
}

export type CardHeaderProps = React.ComponentProps<"div"> & XstyleProp;

/** Title block; place an optional `CardAction` inside for a trailing control. */
export function CardHeader({ className, xstyle, ...props }: CardHeaderProps) {
  return (
    <div {...props} className={cx(sx(styles.header, xstyle), className)} />
  );
}

export type CardTitleProps = React.ComponentProps<"h3"> & XstyleProp;

export function CardTitle({ className, xstyle, ...props }: CardTitleProps) {
  return <h3 {...props} className={cx(sx(styles.title, xstyle), className)} />;
}

export type CardDescriptionProps = React.ComponentProps<"p"> & XstyleProp;

export function CardDescription({
  className,
  xstyle,
  ...props
}: CardDescriptionProps) {
  return (
    <p {...props} className={cx(sx(styles.description, xstyle), className)} />
  );
}

export type CardActionProps = React.ComponentProps<"div"> & XstyleProp;

/**
 * Trailing control slot in the header (the `CardAction` slot): sits at
 * the inline end, spanning title + description rows. Put a `Button`, menu
 * trigger, or badge here — never a hand-styled control.
 *
 * The two-row span is load-bearing, not decorative: the action occupies
 * `row-span-2 row-start-1`. Measured in `#fixtures/card-header`:
 *
 * - Title + description: the action tops with the title. What the span is for.
 * - Title only: the header resolves to `18.89px + 8px gap + 5.11px` = exactly
 *   the 32px action. The phantom second row absorbs the overflow instead of
 *   inflating the title row — no wasted space.
 * - Chip above the title (three rows): the span lands on chip + title, so the
 *   action tops with the **chip**, not the title. That is the header block's
 *   top-right corner and it reads correctly; it is recorded because it looks
 *   like a bug and is not. The grid placement is intentional.
 *
 * So there is no eyebrow slot: a chip above the title already auto-places, and
 * the dashboard composition puts the eyebrow in a `CardDescription` above the
 * title with the badge here.
 */
export function CardAction({ className, xstyle, ...props }: CardActionProps) {
  return (
    <div {...props} className={cx(sx(styles.action, xstyle), className)} />
  );
}

export type CardContentProps = React.ComponentProps<"div"> & XstyleProp;

export function CardContent({ className, xstyle, ...props }: CardContentProps) {
  return (
    <div {...props} className={cx(sx(styles.content, xstyle), className)} />
  );
}

export type CardFooterProps = React.ComponentProps<"div"> & XstyleProp;

export function CardFooter({ className, xstyle, ...props }: CardFooterProps) {
  return (
    <div {...props} className={cx(sx(styles.footer, xstyle), className)} />
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"): a
    // static container that groups content in flow does not leave its plane, so
    // it carries no shadow. `elevation1` now means pressable, movable, or
    // docked. Depth against the canvas comes from the surface step + hairline.
    boxShadow: vars["--ads-elevation-flat"],
    color: vars["--ads-color-text"],
    display: "grid",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  compact: {
    padding: vars["--ads-space-16"],
  },
  regular: {
    padding: vars["--ads-space-20"],
  },
  header: {
    display: "grid",
    // `space2`, not `space1`: 4px is half of an 8px `gap` and half of this
    // package's own `StatTile` header, and a filled 24px chip placed above the
    // 14px title (the composition the Card docs preview uses) read as a
    // collision at 4px. The title size itself is not the problem — 14px
    // semibold for an in-flow surface is the decided title role.
    gap: vars["--ads-space-8"],
    // Auto column collapses to zero when no CardAction is present.
    gridTemplateColumns: "minmax(0, 1fr) auto",
    justifyItems: "start",
    minInlineSize: 0,
  },
  action: {
    alignSelf: "start",
    gridColumnStart: "2",
    gridRowEnd: "span 2",
    gridRowStart: "1",
    justifySelf: "end",
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    gridColumnStart: "1",
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    gridColumnStart: "1",
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  content: {
    color: vars["--ads-color-text"],
    display: "grid",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-12"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
  },
  footer: {
    alignItems: "center",
    // No rule above the actions: §1.3 asks a divider for a reason the padding
    // cannot give, and the root's `space3` gap plus this footer's `space1`
    // margin and `space3` block-start padding already open 28px here. A
    // footer border is opt-in, never a default.
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    marginBlockStart: vars["--ads-space-4"],
    minInlineSize: 0,
    paddingBlockStart: vars["--ads-space-12"],
  },
});

const densityStyles = {
  compact: styles.compact,
  regular: styles.regular,
} as const;
