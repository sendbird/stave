import {
  Blocks,
  Bot,
  Braces,
  Code2,
  Database,
  FolderTree,
  Globe2,
  Layers3,
  Package,
  Rocket,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";
import {
  normalizeProjectAppearanceColor,
  normalizeProjectAppearanceIcon,
  type ProjectAppearanceColorId,
  type ProjectAppearanceIconId,
} from "@/store/project.utils";

export const PROJECT_ICON_OPTIONS: ReadonlyArray<{
  id: ProjectAppearanceIconId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "folder", label: "Folder", icon: FolderTree },
  { id: "code", label: "Code", icon: Code2 },
  { id: "layers", label: "Layers", icon: Layers3 },
  { id: "package", label: "Package", icon: Package },
  { id: "database", label: "Database", icon: Database },
  { id: "sparkles", label: "Sparkles", icon: Sparkles },
  { id: "bot", label: "Bot", icon: Bot },
  { id: "blocks", label: "Blocks", icon: Blocks },
  { id: "braces", label: "Braces", icon: Braces },
  { id: "globe", label: "Globe", icon: Globe2 },
  { id: "rocket", label: "Rocket", icon: Rocket },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
];

export const PROJECT_COLOR_OPTIONS: ReadonlyArray<{
  id: ProjectAppearanceColorId;
  label: string;
  accent: string;
}> = [
  { id: "blue", label: "Blue", accent: "oklch(0.67 0.14 245)" },
  { id: "violet", label: "Violet", accent: "oklch(0.66 0.15 295)" },
  { id: "emerald", label: "Emerald", accent: "oklch(0.68 0.12 160)" },
  { id: "amber", label: "Amber", accent: "oklch(0.76 0.13 78)" },
  { id: "rose", label: "Rose", accent: "oklch(0.68 0.14 20)" },
  { id: "slate", label: "Slate", accent: "oklch(0.63 0.05 255)" },
];

function getProjectAppearanceTone(color?: ProjectAppearanceColorId | null) {
  const colorId = normalizeProjectAppearanceColor(color);
  const accent =
    PROJECT_COLOR_OPTIONS.find((option) => option.id === colorId)?.accent ??
    PROJECT_COLOR_OPTIONS[0]!.accent;
  return {
    background: "var(--sidebar-accent)",
    foreground: accent,
    border: "var(--sidebar-border)",
    accent,
  };
}

export function ProjectIdentityMark(args: {
  icon?: ProjectAppearanceIconId | null;
  color?: ProjectAppearanceColorId | null;
  className?: string;
  iconClassName?: string;
}) {
  const iconId = normalizeProjectAppearanceIcon(args.icon);
  const Icon =
    PROJECT_ICON_OPTIONS.find((option) => option.id === iconId)?.icon ??
    FolderTree;
  const tone = getProjectAppearanceTone(args.color);

  return (
    <span
      className={cx(sx(layoutShellStyles.projectIdentityMark), args.className)}
      style={{
        backgroundColor: tone.background,
        borderColor: tone.border,
        color: tone.foreground,
      }}
    >
      <Icon className={cx(sx(layoutShellStyles.projectIcon), args.iconClassName)} />
    </span>
  );
}

export function ProjectColorSwatch(args: {
  color: ProjectAppearanceColorId;
  className?: string;
}) {
  const tone = getProjectAppearanceTone(args.color);
  return (
    <span
      className={cx(sx(layoutShellStyles.projectColorSwatch), args.className)}
      style={{
        backgroundColor: tone.accent,
        borderColor: tone.border,
      }}
    />
  );
}
