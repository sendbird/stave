import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import type { ToggleProps as BaseToggleProps } from "@base-ui/react/toggle";

export const ToggleButtonRoot = BaseToggle;

export type ToggleButtonRootProps<Value extends string = string> =
  BaseToggleProps<Value>;
