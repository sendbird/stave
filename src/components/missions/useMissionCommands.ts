import { useEffect } from "react";
import { FolderKanban } from "lucide-react";
import {
  registerCommandPaletteContributor,
  type CommandPaletteAction,
} from "@/components/layout/command-palette-registry";
import { useAppStore } from "@/store/app.store";
import { useProjectsStore } from "@/store/projects-store";

/**
 * The command palette's project entry, read fresh each time it opens.
 * Projects are deprecated: the entry shows only for a user who already has
 * one, and there is no way to start a new one.
 */
export function buildMissionCommandActions(): CommandPaletteAction[] {
  if (useProjectsStore.getState().projects.length === 0) return [];
  return [
    {
      id: "projects.open",
      title: "Open projects",
      subtitle: "Your existing projects",
      group: "navigation",
      icon: FolderKanban,
      keywords: ["project", "goal", "coordinator"],
      run: () => useAppStore.getState().openProjects(),
    },
  ];
}

/** Registers the entries once for the app's lifetime. */
export function useMissionCommands() {
  useEffect(() => registerCommandPaletteContributor(() => buildMissionCommandActions()), []);
}
