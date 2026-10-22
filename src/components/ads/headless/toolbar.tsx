import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import type * as React from "react";

export const ToolbarRoot = BaseToolbar.Root;
export const ToolbarGroup = BaseToolbar.Group;
export const ToolbarButton = BaseToolbar.Button;
export const ToolbarSeparator = BaseToolbar.Separator;
export const ToolbarInput = BaseToolbar.Input;

export type ToolbarRootProps = React.ComponentProps<typeof ToolbarRoot>;
export type ToolbarButtonProps = React.ComponentProps<typeof ToolbarButton>;
