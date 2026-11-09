import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type * as React from "react";

export const SwitchRoot = BaseSwitch.Root;
export const SwitchThumb = BaseSwitch.Thumb;

export type SwitchRootProps = React.ComponentProps<typeof SwitchRoot>;
export type SwitchThumbProps = React.ComponentProps<typeof SwitchThumb>;
