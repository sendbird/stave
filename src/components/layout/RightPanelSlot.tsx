import * as stylex from "@stylexjs/stylex";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const slideIn = stylex.keyframes({
  from: { transform: "translateX(100%)" },
  to: { transform: "translateX(0)" },
});

const slideOut = stylex.keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(100%)" },
});

/**
 * The right-hand panel's slot. The slot takes its width in one step, so the
 * column beside it re-lays out once, at the moment the panel opens and only
 * after it has finished leaving when it closes; the panel itself slides
 * across that fixed slot with a transform. No width is ever animated, and the
 * global reduced-motion rule shortens the slide to nothing.
 */
export function RightPanelSlot(props: {
  open: boolean;
  /** Width and display rules of the slot; read while open and while leaving. */
  xstyle?: StyleXValue;
  style?: CSSProperties;
  /** Rendered beside the slot (the resize handle); it leaves with the slot. */
  leading?: ReactNode;
  /**
   * Whether closing slides the panel out. False when the panel only moves
   * elsewhere (the window crossed the inline/overlay width), so two copies
   * never show at once.
   */
  slideOnClose?: boolean;
  children: ReactNode;
}) {
  const [shownOpen, setShownOpen] = useState(props.open);
  const [leaving, setLeaving] = useState(false);
  // A panel restored open at launch appears in place; only a toggle slides.
  const [toggled, setToggled] = useState(false);
  // What the slot showed while open, so it can leave looking the same.
  const lastOpenRef = useRef(props);
  // Derived during render, not in an effect, so the frame that opens or
  // starts closing the panel is the frame that lays it out.
  if (shownOpen !== props.open) {
    setShownOpen(props.open);
    setLeaving(!props.open && props.slideOnClose !== false);
    setToggled(true);
  }
  if (props.open) {
    lastOpenRef.current = props;
  }
  if (!props.open && !leaving) {
    return null;
  }
  const slot = props.open ? props : lastOpenRef.current;
  return (
    <>
      {slot.leading}
      <div
        className={sx(styles.slot, slot.xstyle)}
        style={slot.style}
        data-stave-right-panel=""
        data-state={props.open ? "open" : "closing"}
        // F6 visits the panel while it is open, not while it slides away.
        data-focus-region={props.open ? "panel" : undefined}
      >
        <div
          className={sx(styles.panel, props.open ? toggled && styles.enter : styles.exit)}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && !props.open) {
              setLeaving(false);
            }
          }}
        >
          {slot.children}
        </div>
      </div>
    </>
  );
}

const styles = stylex.create({
  slot: {
    flexShrink: 0,
    overflow: "hidden",
    position: "relative",
  },
  panel: {
    height: "100%",
    width: "100%",
  },
  enter: {
    animationDuration: vars["--ads-motion-duration-normal"],
    animationFillMode: "both",
    animationName: slideIn,
    animationTimingFunction: vars["--ads-motion-ease-standard"],
  },
  exit: {
    animationDuration: vars["--ads-motion-duration-normal"],
    animationFillMode: "both",
    animationName: slideOut,
    animationTimingFunction: vars["--ads-motion-ease-standard"],
  },
});
