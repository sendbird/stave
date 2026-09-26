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
  normalizeRepositoryAppearanceColor,
  normalizeRepositoryAppearanceIcon,
  type RepositoryAppearanceColorId,
  type RepositoryAppearanceIconId,
} from "@/store/repository.utils";

export const REPOSITORY_ICON_OPTIONS: ReadonlyArray<{
  id: RepositoryAppearanceIconId;
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

export const REPOSITORY_COLOR_OPTIONS: ReadonlyArray<{
  id: RepositoryAppearanceColorId;
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

function getRepositoryAppearanceTone(color?: RepositoryAppearanceColorId | null) {
  const colorId = normalizeRepositoryAppearanceColor(color);
  const accent =
    REPOSITORY_COLOR_OPTIONS.find((option) => option.id === colorId)?.accent ??
    REPOSITORY_COLOR_OPTIONS[0]!.accent;
  return {
    background: "var(--sidebar-accent)",
    foreground: accent,
    border: "var(--sidebar-border)",
    accent,
  };
}

export function RepositoryIdentityMark(args: {
  icon?: RepositoryAppearanceIconId | null;
  color?: RepositoryAppearanceColorId | null;
  className?: string;
  iconClassName?: string;
}) {
  const iconId = normalizeRepositoryAppearanceIcon(args.icon);
  const Icon =
    REPOSITORY_ICON_OPTIONS.find((option) => option.id === iconId)?.icon ??
    FolderTree;
  const tone = getRepositoryAppearanceTone(args.color);

  return (
    <span
      className={cx(sx(layoutShellStyles.repositoryIdentityMark), args.className)}
      style={{
        backgroundColor: tone.background,
        borderColor: tone.border,
        color: tone.foreground,
      }}
    >
      <Icon className={cx(sx(layoutShellStyles.repositoryIcon), args.iconClassName)} />
    </span>
  );
}

export function RepositoryColorSwatch(args: {
  color: RepositoryAppearanceColorId;
  className?: string;
}) {
  const tone = getRepositoryAppearanceTone(args.color);
  return (
    <span
      className={cx(sx(layoutShellStyles.repositoryColorSwatch), args.className)}
      style={{
        backgroundColor: tone.accent,
        borderColor: tone.border,
      }}
    />
  );
}
