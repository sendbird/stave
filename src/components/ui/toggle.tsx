import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { toggleStyles } from "../aui/components/Toggle";
import { controlHeights } from "../aui/recipes/control-metrics";
import { controlChrome } from "../aui/recipes/control-chrome";
import { focusRing } from "../aui/recipes/focus-ring";
import { transition } from "../aui/recipes/transition";
import { sx, cx } from "../aui/utils/stylex";
type Options = { size?: "default" | "sm" | "lg" | null; className?: string };
export function toggleVariants({ size = "default", className }: Options = {}) {
  return cx(sx(toggleStyles.root, controlChrome.trigger, transition.control, focusRing.ring,
    controlHeights[size === "lg" ? "lg" : size === "sm" ? "sm" : "md"]), className);
}
export function Toggle({ className, size, ...props }: TogglePrimitive.Props & Options) {
  return <TogglePrimitive {...props} data-slot="toggle" className={(state) => cx(toggleVariants({ size, className }), sx(state.pressed && toggleStyles.pressed, state.disabled && toggleStyles.disabled))} />;
}
