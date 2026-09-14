import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type CardDensity = "compact" | "regular";

export type CardProps = React.ComponentProps<"section"> & {
  /** Spatial scale of the padding. @default "regular" */
  density?: CardDensity;
  /**
   * The whole card is one target — a board card, a connector tile, a template
   * chooser. It gains the shallow elevation role, a hover wash, a press settle,
   * and the shared focus ring when `onClick` is present. ADS supplies button
   * semantics, one tab stop, and Enter/Space activation; the callback is what
   * distinguishes a real target from a static card that merely looks active.
   *
   * Leave it off for a static grouping surface. §1.5: elevation is a lift, not
   * a grouping cue, so a card that cannot be pressed must not look pressable.
   * @default false
   */
  interactive?: boolean;
  /**
   * The card is the chosen one in a set (a plan, a channel, a variant). §1.7
   * pairs the selection fill with one companion signal and names it for this
   * exact surface: "selected bordered row/card → the row's own hairline goes
   * `colorAccent`". Both halves ship together, because in light the fill alone
   * measures 1.11:1 against its own surface.
   * @default false
   */
  selected?: boolean;
} & XstyleProp;

/**
 * Bounded content surface (baseline `Card` anatomy). Compose with `CardHeader`
 * (+ `CardTitle` / `CardDescription` / `CardAction`), `CardContent`, and
 * `CardFooter`. It stays flat by default: the perimeter marks ownership, while
 * elevation remains reserved for pressable (`interactive`) or detached
 * surfaces.
 */
export function Card({
  className,
  density = "regular",
  interactive = false,
  onClick,
  onKeyDown,
  onKeyUp,
  role,
  selected = false,
  tabIndex,
  xstyle,
  ...props
}: CardProps) {
  const actionable = interactive && typeof onClick === "function";
  const theme = themeProps("card", { density });

  return (
    <section
      {...props}
      {...theme}
      className={cx(
        sx(
          styles.root,
          densityStyles[density],
          actionable && styles.interactive,
          actionable && transition.control,
          actionable && focusRing.ring,
          selected && styles.selected,
          actionable && selected && styles.selectedInteractive,
          xstyle,
        ),
        theme.className,
        className,
      )}
      /*
       * `data-selected`, not `aria-selected`: §2's "ARIA is contextual, not
       * cargo-culted". `aria-selected` is only valid on `option`, `tab`, `row`,
       * `gridcell` and `treeitem`, and a Card is a `section` until its consumer
       * gives it a role. The attribute is here so a consumer can style or query
       * descendants off the state; the consumer owns the role and the matching
       * ARIA state.
       */
      data-selected={selected ? "" : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          !actionable ||
          event.defaultPrevented ||
          event.target !== event.currentTarget
        )
          return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.click();
          return;
        }
        if (event.key === " ") event.preventDefault();
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (
          !actionable ||
          event.defaultPrevented ||
          event.key !== " " ||
          event.target !== event.currentTarget
        )
          return;
        event.preventDefault();
        event.currentTarget.click();
      }}
      role={actionable ? (role ?? "button") : role}
      tabIndex={actionable ? (tabIndex ?? 0) : tabIndex}
    />
  );
}

export type CardHeaderProps = React.ComponentProps<"div"> & XstyleProp;

/** Title block; place an optional `CardAction` inside for a trailing control. */
export function CardHeader({ className, xstyle, ...props }: CardHeaderProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("card", "header")}
      className={cx(sx(styles.header, xstyle), className)}
    />
  );
}

export type CardTitleProps = React.ComponentProps<"h3"> & XstyleProp;

export function CardTitle({ className, xstyle, ...props }: CardTitleProps) {
  return (
    <h3
      {...props}
      {...themeSlotProps("card", "title")}
      className={cx(sx(styles.title, xstyle), className)}
    />
  );
}

export type CardDescriptionProps = React.ComponentProps<"p"> & XstyleProp;

export function CardDescription({
  className,
  xstyle,
  ...props
}: CardDescriptionProps) {
  return (
    <p
      {...props}
      {...themeSlotProps("card", "description")}
      className={cx(sx(styles.description, xstyle), className)}
    />
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
    <div
      {...props}
      {...themeSlotProps("card", "action")}
      className={cx(sx(styles.action, xstyle), className)}
    />
  );
}

export type CardContentProps = React.ComponentProps<"div"> & XstyleProp;

export function CardContent({ className, xstyle, ...props }: CardContentProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("card", "content")}
      className={cx(sx(styles.content, xstyle), className)}
    />
  );
}

export type CardFooterProps = React.ComponentProps<"div"> & XstyleProp;

export function CardFooter({ className, xstyle, ...props }: CardFooterProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("card", "footer")}
      className={cx(sx(styles.footer, xstyle), className)}
    />
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
  /*
   * `interactive` is what §1.5 reserves elevation FOR: the surface can be
   * pressed, so it is allowed to leave its plane. It takes the same shallow
   * `elevationRaised` → `elevationFlat` press the bordered Button variants
   * take, and the same `colorMixInk 6%` hover wash `Button secondary` uses, so
   * a pressable card and a pressable button read as members of one family
   * instead of two hand-tuned surfaces.
   *
   * The wash is composited with `color-mix` on the card's own surface rather
   * than layered as a second background, because a card frequently holds its
   * own tinted children and an overlay token would wash those too.
   */
  interactive: {
    backgroundColor: {
      default: vars["--ads-color-surface-raised"],
      ":hover": `color-mix(in srgb, ${vars["--ads-color-surface-raised"]}, ${vars["--ads-color-mix-ink"]} 6%)`,
      ":active": `color-mix(in srgb, ${vars["--ads-color-surface-raised"]}, ${vars["--ads-color-mix-ink"]} 10%)`,
    },
    boxShadow: {
      default: vars["--ads-elevation-raised"],
      ":active": vars["--ads-elevation-flat"],
    },
    cursor: "pointer",
  },
  /*
   * §1.7, the row named "Selected bordered row/card": the fill plus the card's
   * own hairline going `colorAccent`. The companion lives in this same rule
   * because the fill cannot carry the state alone — 1.11:1 against its own
   * surface in light.
   *
   * The hover/press steps are restated on the selection fill rather than
   * inherited from `interactive`. StyleX merges atomically per
   * property-and-condition pair, so leaving them out would keep
   * `interactive`'s `:hover` atom alive and a hovered selected card would fade
   * back to the unselected wash — losing the state exactly while the pointer is
   * on it. Same `colorMixInk` steps, different base.
   */
  selected: {
    backgroundColor: vars["--ads-color-selection-fill"],
    borderColor: vars["--ads-color-accent"],
  },
  selectedInteractive: {
    backgroundColor: {
      default: vars["--ads-color-selection-fill"],
      ":hover": `color-mix(in srgb, ${vars["--ads-color-selection-fill"]}, ${vars["--ads-color-mix-ink"]} 6%)`,
      ":active": `color-mix(in srgb, ${vars["--ads-color-selection-fill"]}, ${vars["--ads-color-mix-ink"]} 10%)`,
    },
    // Restated with the interactive hover/press fill so the selected-state
    // contract remains locally complete: tint plus the card's own accent edge.
    borderColor: vars["--ads-color-accent"],
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
