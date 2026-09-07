import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";
import { Tabs as AdsTabs } from "../ads/components/Tabs";
import { styles } from "../ads/components/Tabs.styles";
import { sx, cx } from "../ads/utils/stylex";

type ListVariant = "default" | "line" | "soft";

export const tabsShimStyles = stylex.create({
  /**
   * The ADS root is `display: grid` with NO `gridTemplateRows`, so every row
   * is an implicit `auto` track. That is fine while the root is content-sized,
   * but the moment a caller drops it into a stretched flex/grid parent (every
   * right-rail panel, the Skills dialog, the Source Control panes) the extra
   * height is distributed EQUALLY across those auto rows: a 1111px shell gave
   * the tab strip a 438px row and the strip floated in the middle of the panel.
   *
   * Every Stave consumer wants the same thing — strip at the top, panel takes
   * the rest — so the shim states it once: an explicit `auto minmax(0, 1fr)`
   * pair plus `alignContent: start`. When the root is content-sized the `1fr`
   * row is sized to its content (fr in an indefinite container behaves as
   * max-content), so unstretched call sites are unaffected.
   *
   * Vertical roots are excluded: their axis is `gridTemplateColumns`
   * (`styles.rootVertical`), and forcing two rows onto a rail would push a
   * third grid item (a second mounted panel) onto a new row beside it.
   */
  fillRows: {
    alignContent: "start",
    gridTemplateRows: "auto minmax(0, 1fr)",
  },
});

/**
 * `Tabs` IS the ADS root, so the scale axes belong here and only here:
 * `variant` (`"pill" | "line"`) and `size` (`"sm" | "md"`) land on
 * `Tabs.Root`, which publishes them through the ADS config context so the
 * list, every tab, and the indicator agree on one value. The strip used to
 * take `variant` on `TabsList` instead, where it was dropped on the floor
 * (`_variant`) — the list could not tell the indicator to become an underline,
 * so a caller asking for a line strip got a pill one and hand-drew the rule.
 */
export function Tabs({
  className,
  orientation,
  ...props
}: ComponentProps<typeof AdsTabs.Root>) {
  const rows = orientation === "vertical" ? undefined : sx(tabsShimStyles.fillRows);
  return (
    <AdsTabs.Root
      {...props}
      orientation={orientation}
      className={
        typeof className === "function"
          ? (state) => cx(rows, className(state))
          : cx(rows, className)
      }
    />
  );
}

/**
 * @deprecated Pass `variant` to `Tabs` instead. This helper can only paint the
 * list, so the indicator keeps the pill shape and the two idioms stack. Kept
 * for the shared `@/components/ui` barrel export until that entry is retired.
 */
export function tabsListVariants({ variant = "default", className }: { variant?: ListVariant | null; className?: string } = {}) {
  return cx(sx(styles.list, variant === "line" && styles.listLine), className);
}

/**
 * The shim owns the indicator because none of its callers compose one; parts
 * assembled straight off ADS (`SectionTabs`) render `<Tabs.Indicator/>`
 * themselves. Exactly one indicator per list either way.
 */
export function TabsList({
  /**
   * @deprecated Set `variant` on `Tabs` (the root) instead — that is the only
   * place it can reach the list, the tabs, AND the indicator. Accepted here
   * purely so the two remaining call sites keep compiling: `WorkspaceSkillsPanel`
   * already passes `variant="line"` to the root as well (so the prop is
   * redundant there), and `ScriptsManager` passes `"soft"`, which has never
   * been an ADS variant and has never rendered anything.
   */
  variant: _variant,
  children,
  ...props
}: ComponentProps<typeof AdsTabs.List> & { variant?: ListVariant | null }) {
  return <AdsTabs.List {...props} data-slot="tabs-list">{children}<AdsTabs.Indicator /></AdsTabs.List>;
}
export const TabsTrigger = AdsTabs.Tab;
export const TabsContent = AdsTabs.Panel;
