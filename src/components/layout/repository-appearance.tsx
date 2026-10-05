import { i18n } from "@/i18n";
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
  { id: "folder", get label() { return i18n.t("settings:repositoryAppearance.folder"); }, icon: FolderTree },
  { id: "code", get label() { return i18n.t("settings:repositoryAppearance.code"); }, icon: Code2 },
  { id: "layers", get label() { return i18n.t("settings:repositoryAppearance.layers"); }, icon: Layers3 },
  { id: "package", get label() { return i18n.t("settings:repositoryAppearance.package"); }, icon: Package },
  { id: "database", get label() { return i18n.t("settings:repositoryAppearance.database"); }, icon: Database },
  { id: "sparkles", get label() { return i18n.t("settings:repositoryAppearance.sparkles"); }, icon: Sparkles },
  { id: "bot", get label() { return i18n.t("settings:repositoryAppearance.bot"); }, icon: Bot },
  { id: "blocks", get label() { return i18n.t("settings:repositoryAppearance.blocks"); }, icon: Blocks },
  { id: "braces", get label() { return i18n.t("settings:repositoryAppearance.braces"); }, icon: Braces },
  { id: "globe", get label() { return i18n.t("settings:repositoryAppearance.globe"); }, icon: Globe2 },
  { id: "rocket", get label() { return i18n.t("settings:repositoryAppearance.rocket"); }, icon: Rocket },
  { id: "terminal", get label() { return i18n.t("settings:sections.terminal.label"); }, icon: SquareTerminal },
];

export const REPOSITORY_COLOR_OPTIONS: ReadonlyArray<{
  id: RepositoryAppearanceColorId;
  label: string;
  accent: string;
}> = [
  { id: "blue", get label() { return i18n.t("settings:repositoryAppearance.blue"); }, accent: "oklch(0.67 0.14 245)" },
  { id: "violet", get label() { return i18n.t("settings:repositoryAppearance.violet"); }, accent: "oklch(0.66 0.15 295)" },
  { id: "emerald", get label() { return i18n.t("settings:repositoryAppearance.emerald"); }, accent: "oklch(0.68 0.12 160)" },
  { id: "amber", get label() { return i18n.t("settings:repositoryAppearance.amber"); }, accent: "oklch(0.76 0.13 78)" },
  { id: "rose", get label() { return i18n.t("settings:repositoryAppearance.rose"); }, accent: "oklch(0.68 0.14 20)" },
  { id: "slate", get label() { return i18n.t("settings:repositoryAppearance.slate"); }, accent: "oklch(0.63 0.05 255)" },
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
