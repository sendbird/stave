import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type * as React from "react";

export const ToggleGroupRoot = BaseToggleGroup;
export const ToggleRoot = Toggle;

export type ToggleGroupRootProps = React.ComponentProps<typeof ToggleGroupRoot>;
export type ToggleRootProps = React.ComponentProps<typeof ToggleRoot>;
