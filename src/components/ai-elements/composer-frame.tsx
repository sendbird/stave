import type { CSSProperties, ReactNode } from "react";
import {
  COMPOSER_CONTROL_LANE,
  ComposerControlDensityProvider,
} from "@/components/ai-elements/composer-control-density";
import {
  COMPOSER_WING_COLLAPSED_WIDTH_PX,
  useComposerWingReveal,
} from "@/hooks/use-composer-wing-reveal";
import { cn } from "@/lib/utils";

/**
 * Frame geometry, in one place.
 *
 * The frame occupies the width the docked turn-activity shelf had on its own
 * (the full `max-w-6xl` composer measure) and one number — the 0.75rem tuck —
 * sets every offset in it:
 *
 * - top and bottom shelves sit in the card's column and are inset 0.75rem from
 *   it on each side — the same relation the docked shelf has to the composer
 *   measure, so a shelf still reads as slightly smaller than the card
 * - side wings are inset 0.75rem from the top and bottom of the card, so a wing
 *   ends flush with the shelf edge tucked above it
 * - every bar overlaps the card by 0.75rem, so the seam hides behind it
 *
 * A resting wing is one 3.5rem icon column plus that tuck, and the frame
 * reserves only that: the card gives up 4.25rem per side rather than the 9rem
 * a revealed wing needs. The reveal overhangs the frame instead, capped to the
 * room beside it by `useComposerWingReveal`.
 */
const COMPOSER_WING_TRACK_CLASS = "w-[3.75rem] min-w-[3.75rem]";
/** The wing ends where the shelf tucked above it ends. */
const COMPOSER_WING_INSET_CLASS = "inset-y-3";
/** Same inset the docked turn-activity shelf has against the composer measure. */
const COMPOSER_SHELF_INSET_CLASS = "mx-3";

/**
 * Both tracks are reserved as soon as either wing exists, so the card stays
 * centred in the frame — and therefore under the message column — when only one
 * side has controls. Written out per case rather than interpolated: Tailwind
 * only emits arbitrary utilities it can read literally in the source, and a
 * template-built class silently degrades to auto-sized columns, which is
 * exactly what the earlier `[grid-template-columns:...]` form did.
 */
function gridTemplateColumns(hasWings: boolean): string {
  return hasWings
    ? "grid-cols-[3.75rem_minmax(0,1fr)_3.75rem]"
    : "grid-cols-[minmax(0,1fr)]";
}

/**
 * Four-bar composer chrome drawn like the docked turn-activity shelf: each bar
 * shares the card surface and tucks its inner edge underneath the raised input.
 *
 * The wings are absolutely positioned inside their reserved track, so the row
 * height is decided by the card alone — adding or removing a control changes
 * what is inside a wing, never how tall the composer is.
 */
export function ComposerFrame(props: {
  top?: ReactNode;
  bottom?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasTop = Boolean(props.top);
  const hasBottom = Boolean(props.bottom);
  const hasLeft = Boolean(props.left);
  const hasRight = Boolean(props.right);
  const hasWings = hasLeft || hasRight;
  const cardColumnClass = hasWings ? "col-start-2" : "col-start-1";
  const { ref: revealRef, revealWidthPx } = useComposerWingReveal();

  return (
    <div
      ref={revealRef}
      data-composer-frame="true"
      // When there is no room beside the frame the wings stay icon columns, and
      // the labels stay out of the markup's way instead of being clipped.
      data-wing-reveal={
        revealWidthPx > COMPOSER_WING_COLLAPSED_WIDTH_PX ? "on" : "off"
      }
      className={cn(
        "isolate grid items-stretch",
        gridTemplateColumns(hasWings),
        props.className,
      )}
      style={
        {
          "--composer-wing-expanded-width": `${revealWidthPx}px`,
        } as CSSProperties
      }
    >
      {hasTop ? (
        <div
          data-composer-frame-slot="top"
          className={cn(
            "relative z-0 row-start-1 -mb-3 min-w-0",
            COMPOSER_SHELF_INSET_CLASS,
            cardColumnClass,
          )}
        >
          {props.top}
        </div>
      ) : null}
      {hasLeft ? (
        <div
          data-composer-frame-slot="left"
          className={cn(
            "relative z-0 col-start-1 row-start-2 min-h-0 self-stretch",
            COMPOSER_WING_TRACK_CLASS,
          )}
        >
          {/*
            Absolute, so a tall stack of controls cannot stretch the grid row
            and drag the card open with it. The wing is exactly as tall as the
            card minus the tuck at each end, whatever it holds.
          */}
          <div
            className={cn(
              "absolute left-0 right-[-0.75rem] flex justify-end",
              COMPOSER_WING_INSET_CLASS,
            )}
          >
            {props.left}
          </div>
        </div>
      ) : null}
      <div className={cn("relative z-10 row-start-2 min-w-0", cardColumnClass)}>
        {props.children}
      </div>
      {hasRight ? (
        <div
          data-composer-frame-slot="right"
          className={cn(
            "relative z-0 col-start-3 row-start-2 min-h-0 self-stretch",
            COMPOSER_WING_TRACK_CLASS,
          )}
        >
          <div
            className={cn(
              "absolute left-[-0.75rem] right-0 flex justify-start",
              COMPOSER_WING_INSET_CLASS,
            )}
          >
            {props.right}
          </div>
        </div>
      ) : null}
      {hasBottom ? (
        <div
          data-composer-frame-slot="bottom"
          className={cn(
            "relative z-0 row-start-3 -mt-3 min-w-0",
            COMPOSER_SHELF_INSET_CLASS,
            cardColumnClass,
          )}
        >
          {props.bottom}
        </div>
      ) : null}
    </div>
  );
}

export function ComposerFrameWing(props: {
  side: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <ComposerControlDensityProvider value="icon">
      <div
        data-composer-frame-wing={props.side}
        data-side={props.side}
        className={cn(
          // Width is owned by CSS (`--composer-wing-collapsed-width` at rest,
          // `--composer-wing-expanded-width` on hover/focus/open) so the shelf
          // grows outwards from its fixed inner edge with a real rounded,
          // ringed outer edge in both states.
          // `shrink-0`: a revealed wing is wider than its reserved track and
          // must overhang it rather than being squeezed back to fit.
          "composer-frame-wing group/composer-wing turn-activity-surface flex h-full max-h-full min-h-0 shrink-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain py-2 [justify-content:safe_center] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // 2rem rows with a real gap: a wing holds a handful of controls, not
          // a list, so the hit targets are sized for pointing at rather than
          // for packing in.
          COMPOSER_CONTROL_LANE.wing,
          "[&_svg]:size-4 [&_svg]:shrink-0",
          // The inner 0.75rem of a wing is hidden behind the card, so the
          // padding is asymmetric on purpose: it puts each icon on the centre
          // line of the *visible* icon column, and — because that padding is
          // measured from the wing's fixed inner edge — leaves it there while
          // the wing reveals outwards.
          props.side === "left"
            ? "items-end pl-2 pr-5 [&_[data-composer-control]]:flex-row-reverse [&_[data-composer-control]]:justify-start [&_[data-composer-control]]:text-right"
            : "items-start pl-5 pr-2 [&_[data-composer-control]]:justify-start [&_[data-composer-control]]:text-left",
          props.className,
        )}
      >
        {props.children}
      </div>
    </ComposerControlDensityProvider>
  );
}

/**
 * The bottom shelf: ambient state for the session rather than the next turn —
 * workspace and branch on the left, low-traffic readouts (runtime) on the
 * right. Mirrors the turn-activity shelf above, flipped.
 */
export function ComposerFrameStatusBar(props: {
  children?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-composer-frame-status-bar="true"
      className={cn(
        // One rule for the visible box: every edge clears its content by the
        // same 0.75rem. Three of them say so directly (`px-3`, `pb-3`); the top
        // has to say `pt-6`, because its first 0.75rem is hidden behind the
        // card and only the second is padding anyone can see. Paying the tuck
        // out of a single `pt-5` is what made the row sit high in its bar.
        "turn-activity-surface flex min-h-13 items-center justify-between gap-2.5 overflow-hidden rounded-b-xl rounded-t-none px-3 pb-3 pt-6 text-[0.8125rem] leading-5 text-muted-foreground",
        props.className,
      )}
    >
      <div
        // Named so the trailing tray can measure it: the controls fold into a
        // `⋯` exactly when this line would start truncating.
        data-composer-status-leading="true"
        // Deliberately not `flex-1`: sized by its content (shrinking only when
        // squeezed) so the tray can read a real width off it instead of the
        // whole free row.
        className="flex min-w-0 items-center gap-2.5"
      >
        {props.children}
      </div>
      {props.trailing ? (
        // The shelf lane. Controls arrive wearing `COMPOSER_CONTROL_BUTTON`
        // and are resized here through their own marker, so the tray's `⋯`
        // trigger and any future row chrome keep their own geometry.
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 [&_svg]:shrink-0",
            COMPOSER_CONTROL_LANE.shelf,
          )}
        >
          {props.trailing}
        </div>
      ) : null}
    </div>
  );
}
