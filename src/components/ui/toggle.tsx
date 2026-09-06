import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { toggleStyles } from "../ads/components/Toggle";
import { controlHeights } from "../ads/recipes/control-metrics";
import { controlChrome } from "../ads/recipes/control-chrome";
import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { sx, cx } from "../ads/utils/stylex";
type Options = { variant?: "default" | "outline" | null; size?: "default" | "sm" | "lg" | null; className?: string };
export function toggleVariants({ size = "default", className }: Options = {}) {
  return cx(sx(toggleStyles.root, controlChrome.trigger, transition.control, focusRing.ring,
    controlHeights[size === "lg" ? "lg" : size === "sm" ? "sm" : "md"]), className);
}
export function Toggle({ className, variant, size, ...props }: TogglePrimitive.Props & Options) {
  return <TogglePrimitive {...props} data-slot="toggle" className={(state) => cx(toggleVariants({ variant, size, className }), sx(state.pressed && toggleStyles.pressed, state.disabled && toggleStyles.disabled))} />;
}
