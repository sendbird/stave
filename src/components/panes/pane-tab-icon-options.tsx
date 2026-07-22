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
  { id: "circle", label: "Circle", icon: Circle },
  { id: "bookmark", label: "Bookmark", icon: Bookmark },
  { id: "sparkles", label: "Sparkles", icon: Sparkles },
  { id: "code", label: "Code", icon: Code2 },
  { id: "globe", label: "Globe", icon: Globe2 },
  { id: "terminal", label: "Terminal", icon: Terminal },
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
  const Icon = resolvePaneCustomIcon(props.name);
  return Icon ? <Icon className="size-4 text-muted-foreground" /> : null;
}
