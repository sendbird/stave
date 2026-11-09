import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type * as React from "react";

export const TabsRoot = BaseTabs.Root;
export const TabsList = BaseTabs.List;
export const TabsTab = BaseTabs.Tab;
export const TabsIndicator = BaseTabs.Indicator;
export const TabsPanel = BaseTabs.Panel;

export type TabsRootProps = React.ComponentProps<typeof TabsRoot>;
export type TabsTabProps = React.ComponentProps<typeof TabsTab>;
