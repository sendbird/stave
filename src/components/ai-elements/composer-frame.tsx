import { frameStyles } from "./composer-frame.styles";
import { sx } from "../ads/utils/stylex";
import type { CSSProperties, ReactNode } from "react";
import {
  COMPOSER_CONTROL_LANE,
  ComposerControlDensityProvider,
} from "@/components/ai-elements/composer-control-density";
import {
  COMPOSER_WING_COLLAPSED_WIDTH_PX,
  useComposerWingReveal,
} from "@/hooks/use-composer-wing-reveal";
import { cx } from "../ads/utils/stylex";

/**
 * Frame geometry, in one place.
 *
 * The frame occupies the width the docked turn-activity shelf had on its own
 * (the full composer measure) and one number — the 0.75rem tuck —
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
  const cardColumn = hasWings ? frameStyles.wingCardColumn : frameStyles.cardColumn;
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
      className={cx(
        sx(frameStyles.frame, hasWings && frameStyles.withWings),
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
          className={cx(
            sx(frameStyles.top, cardColumn),
          )}
        >
          {props.top}
        </div>
      ) : null}
      {hasLeft ? (
        <div
          data-composer-frame-slot="left"
          className={cx(
            sx(frameStyles.track, frameStyles.leftTrack),
          )}
        >
          {/*
            Absolute, so a tall stack of controls cannot stretch the grid row
            and drag the card open with it. The wing is exactly as tall as the
            card minus the tuck at each end, whatever it holds.
          */}
          <div
            className={cx(
              sx(frameStyles.leftInset),
            )}
          >
            {props.left}
          </div>
        </div>
      ) : null}
      <div className={sx(frameStyles.card, cardColumn)}>
        {props.children}
      </div>
      {hasRight ? (
        <div
          data-composer-frame-slot="right"
          className={cx(
            sx(frameStyles.track, frameStyles.rightTrack),
          )}
        >
          <div
            className={cx(
              sx(frameStyles.rightInset),
            )}
          >
            {props.right}
          </div>
        </div>
      ) : null}
      {hasBottom ? (
        <div
          data-composer-frame-slot="bottom"
          className={cx(
            sx(frameStyles.bottom, cardColumn),
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
        className={cx(
          "composer-frame-wing turn-activity-surface",
          COMPOSER_CONTROL_LANE.wing,
          sx(frameStyles.wing, props.side === "left" ? frameStyles.leftWing : frameStyles.rightWing),
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
      className={cx(
        "turn-activity-surface",
        sx(frameStyles.status),
        props.className,
      )}
    >
      <div
        // Named so the trailing tray can measure it: the controls fold into a
        // `⋯` exactly when this line would start truncating.
        data-composer-status-leading="true"
        // Sized by its content (shrinking only when
        // squeezed) so the tray can read a real width off it instead of the
        // whole free row.
        className={sx(frameStyles.leading)}
      >
        {props.children}
      </div>
      {props.trailing ? (
        // The shelf lane. Controls arrive wearing `COMPOSER_CONTROL_BUTTON`
        // and are resized here through their own marker, so the tray's `⋯`
        // trigger and any future row chrome keep their own geometry.
        <div
          className={cx(
            sx(frameStyles.trailing),
            COMPOSER_CONTROL_LANE.shelf,
          )}
        >
          {props.trailing}
        </div>
      ) : null}
    </div>
  );
}
