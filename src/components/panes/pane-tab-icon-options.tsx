import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import {
  Bookmark,
  Circle,
  Code2,
  Globe2,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export const PANE_CUSTOM_ICON_OPTIONS = [
  { id: "circle", get label() { return i18n.t("panes:paneTabIconOptions.circle"); }, icon: Circle },
  { id: "bookmark", get label() { return i18n.t("panes:paneTabIconOptions.bookmark"); }, icon: Bookmark },
  { id: "sparkles", get label() { return i18n.t("panes:paneTabIconOptions.sparkles"); }, icon: Sparkles },
  { id: "code", get label() { return i18n.t("panes:paneTabIconOptions.code"); }, icon: Code2 },
  { id: "globe", get label() { return i18n.t("panes:paneTabIconOptions.globe"); }, icon: Globe2 },
  { id: "terminal", get label() { return i18n.t("panes:paneTabIconOptions.terminal"); }, icon: Terminal },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: LucideIcon;
}[];

export type PaneCustomIconName =
  (typeof PANE_CUSTOM_ICON_OPTIONS)[number]["id"];

export function resolvePaneCustomIcon(
  value?: string | null,
): LucideIcon | null {
  return (
    PANE_CUSTOM_ICON_OPTIONS.find((option) => option.id === value)?.icon ??
    null
  );
}

export function PaneCustomIcon(props: { name: string }) {
  useTranslation();
  const Icon = resolvePaneCustomIcon(props.name);
  return Icon ? <Icon className={sx(styles.icon)} /> : null;
}

const styles = stylex.create({
icon: {width:16,height:16,color:vars["--ads-color-text-muted"]}
});
