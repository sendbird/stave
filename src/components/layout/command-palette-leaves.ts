import { i18n } from "@/i18n";
import { Monitor, Moon, Palette, SquarePen, Sun } from "lucide-react";
import {
  normalizeCommandPaletteSearchValue,
  scoreCommandPaletteSearch,
  type CommandPaletteAction,
  type CommandPaletteRepositorySummary,
} from "@/components/layout/command-palette-registry";

/**
 * Leaf entries are the options one level inside a command (a theme, an
 * appearance mode, a repository to start a task in), offered only while the
 * reader is searching, so typing a name reaches the option without opening
 * Settings or switching repositories first.
 */
export const MAX_COMMAND_PALETTE_LEAF_SUGGESTIONS = 3;

export type CommandPaletteAppearanceMode = "light" | "dark" | "system";

export interface CommandPaletteLeaf extends CommandPaletteAction {
  /** The option's own name; typing exactly this ranks the leaf first. */
  leafName: string;
}

export interface CommandPaletteLeafSources {
  themes: ReadonlyArray<{ id: string; name: string; baseMode: "light" | "dark" }>;
  activeThemeId: string | null;
  appearanceMode: CommandPaletteAppearanceMode;
  repositories: readonly CommandPaletteRepositorySummary[];
  actions: {
    applyTheme: (themeId: string) => void;
    setAppearanceMode: (mode: CommandPaletteAppearanceMode) => void;
    newTaskInRepository: (repository: CommandPaletteRepositorySummary) => Promise<void> | void;
  };
}

const APPEARANCE_MODES = [
  { mode: "light", icon: Sun, labelKey: "settings:themeSection.appearance.light" },
  { mode: "dark", icon: Moon, labelKey: "settings:themeSection.appearance.dark" },
  { mode: "system", icon: Monitor, labelKey: "settings:themeSection.appearance.system" },
] as const;

/** Every leaf the palette can suggest, built once per palette context. */
export function buildCommandPaletteLeaves(
  sources: CommandPaletteLeafSources,
): CommandPaletteLeaf[] {
  const leaves: CommandPaletteLeaf[] = [];
  const current = i18n.t("shell:commandPaletteLeaves.current");

  for (const { mode, icon, labelKey } of APPEARANCE_MODES) {
    const name = i18n.t(labelKey);
    const active = sources.activeThemeId === null && sources.appearanceMode === mode;
    leaves.push({
      id: `leaf.appearance.${mode}`,
      leafName: name,
      title: i18n.t("shell:commandPaletteLeaves.appearance", { name }),
      ...(active ? { subtitle: current } : {}),
      group: "settings",
      icon,
      keywords: ["appearance", "mode", "theme", mode],
      run: () => sources.actions.setAppearanceMode(mode),
      source: "dynamic",
      customizable: false,
    });
  }

  for (const theme of sources.themes) {
    leaves.push({
      id: `leaf.theme.${theme.id}`,
      leafName: theme.name,
      title: i18n.t("shell:commandPaletteLeaves.theme", { name: theme.name }),
      ...(sources.activeThemeId === theme.id ? { subtitle: current } : {}),
      group: "settings",
      icon: Palette,
      keywords: ["theme", theme.id, theme.baseMode],
      run: () => sources.actions.applyTheme(theme.id),
      source: "dynamic",
      customizable: false,
    });
  }

  for (const repository of sources.repositories) {
    leaves.push({
      id: `leaf.new-task.${repository.repositoryPath}`,
      leafName: repository.repositoryName,
      title: i18n.t("shell:commandPaletteLeaves.newTaskIn", {
        name: repository.repositoryName,
      }),
      subtitle: repository.isCurrent
        ? i18n.t("shell:commandPaletteRegistry.currentRepository")
        : repository.repositoryPath,
      group: "task",
      icon: SquarePen,
      keywords: ["new task", "create task", repository.repositoryPath],
      run: () => sources.actions.newTaskInRepository(repository),
      source: "dynamic",
      customizable: false,
    });
  }

  return leaves;
}

/**
 * The leaves worth suggesting for `query`: none for an empty query, an exact
 * name match first, then the best matches, at most `limit` of them.
 */
export function rankCommandPaletteLeaves(args: {
  leaves: readonly CommandPaletteLeaf[];
  query: string;
  limit?: number;
}): CommandPaletteLeaf[] {
  const query = normalizeCommandPaletteSearchValue(args.query);
  if (!query) {
    return [];
  }
  const limit = args.limit ?? MAX_COMMAND_PALETTE_LEAF_SUGGESTIONS;
  return args.leaves
    .map((leaf, index) => ({
      leaf,
      index,
      exact: normalizeCommandPaletteSearchValue(leaf.leafName) === query,
      score: scoreCommandPaletteSearch({ action: leaf, groupTitle: "", query }),
    }))
    .filter((entry) => entry.exact || entry.score > 0)
    .sort(
      (left, right) =>
        Number(right.exact) - Number(left.exact) ||
        right.score - left.score ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map((entry) => entry.leaf);
}
