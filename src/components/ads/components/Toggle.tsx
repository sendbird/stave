import * as stylex from "@stylexjs/stylex";
import { m } from "motion/react";
import type * as React from "react";

import {
  ToggleButtonRoot,
  type ToggleButtonRootProps,
} from "../headless/toggle";
import { controlChrome } from "../recipes/control-chrome";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { controlWidth } from "../recipes/control-width";
import { springSnappy, vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type ToggleProps = Omit<
  ToggleButtonRootProps,
  "children" | "className"
> & {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
};

export function Toggle({
  children,
  className,
  disabled,
  icon,
  render,
  ...props
}: ToggleProps) {
  return (
    <ToggleButtonRoot
      {...props}
      className={(state) =>
        cx(
          sx(
            styles.root,
            controlWidth.intrinsic,
            controlChrome.trigger,
            transition.control,
            controlHeights.md,
            focusRing.ring,
            state.pressed && styles.pressed,
            state.disabled && styles.disabled,
          ),
          className,
        )
      }
      disabled={disabled}
      // Spring press for tactility (Motion owns transform); falls back to a
      // static element without a provider / a caller-supplied render.
      //
      // `y`, not `scale`: a Toggle takes its width from its label and from
      // whatever lays it out, so it is one of the two controls in the package a
      // flex/grid parent can stretch to the full width of a panel. At
      // `scalePress` a stretched Toggle's side edges travelled ~18px while its
      // top and bottom moved 0.6px — it read as the row snapping narrow and
      // springing back, not as a press. `pressDepth` is 1px at every width, and
      // `springSnappy` is critically damped so the release does not overshoot
      // back through the resting size. The one-pixel distance is local press
      // geometry; the foundation's 4px/8px distances are enter/exit travel.
      render={
        render ?? (
          <m.button
            transition={springSnappy}
            whileTap={disabled ? undefined : { y: 1 }}
          />
        )
      }
    >
      {icon ? <span className={sx(styles.icon)}>{icon}</span> : null}
      <span className={sx(styles.label)}>{children}</span>
    </ToggleButtonRoot>
  );
}

const styles = stylex.create({
  // Resting/hover/press chrome (background, border, box-shadow, color) comes
  // from `controlChrome.trigger` (composed at the call site) — the same
  // bordered-pressable language `Button` and every overlay trigger use.
  // `root` keeps only what is genuinely Toggle's own: layout, radius, type.
  root: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    justifyContent: "flex-start",
    // Height comes from the shared control-metrics recipe (`controlHeights.md`,
    // composed at the call site) — a local `minBlockSize: controlHeight` looked
    // identical on desktop but silently opted the toggle out of the
    // `(pointer: coarse)` 44px bump every other control gets.
    paddingBlock: 0,
    paddingInline: vars["--ads-space-12"],
  },
  // "On" is a filled accent so the pressed state reads at a glance (the old
  // colorAccentSoft fill was ~indistinguishable from the surface).
  pressed: {
    backgroundColor: {
      default: vars["--ads-color-accent"],
      ":hover": vars["--ads-color-accent-hover"],
    },
    borderColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  icon: {
    alignItems: "center",
    display: "inline-flex",
  },
  label: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export { styles as toggleStyles };
