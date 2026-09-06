import type { ComponentProps } from "react";
import { Tabs as AdsTabs } from "../ads/components/Tabs";
import { styles } from "../ads/components/Tabs.styles";
import { sx, cx } from "../ads/utils/stylex";

type ListVariant = "default" | "line" | "soft";
export const Tabs = AdsTabs.Root;
export function tabsListVariants({ variant = "default", className }: { variant?: ListVariant | null; className?: string } = {}) {
  return cx(sx(styles.list, variant === "line" && styles.listLine), className);
}
export function TabsList({ variant: _variant, children, ...props }: ComponentProps<typeof AdsTabs.List> & { variant?: ListVariant | null }) {
  return <AdsTabs.List {...props} data-slot="tabs-list">{children}<AdsTabs.Indicator /></AdsTabs.List>;
}
export const TabsTrigger = AdsTabs.Tab;
export const TabsContent = AdsTabs.Panel;
