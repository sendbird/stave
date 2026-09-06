import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import type * as React from "react";

export const CollapsibleRoot = BaseCollapsible.Root;
export const CollapsibleTrigger = BaseCollapsible.Trigger;
export const CollapsiblePanel = BaseCollapsible.Panel;

export type CollapsibleRootProps = React.ComponentProps<typeof CollapsibleRoot>;
