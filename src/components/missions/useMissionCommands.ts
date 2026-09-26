import { useEffect } from "react";
import { BookOpen, Target } from "lucide-react";
import {
  registerCommandPaletteContributor,
  type CommandPaletteAction,
} from "@/components/layout/command-palette-registry";
import { isActiveMissionState } from "@/lib/missions/domain";
import { useAppStore } from "@/store/app.store";
import { missionTaskKey, useMissionsStore } from "@/store/missions-store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";

/** The command palette's mission entries, read fresh each time it opens. */
export function buildMissionCommandActions(): CommandPaletteAction[] {
  const app = useAppStore.getState();
  const workspaceId = app.activeWorkspaceId;
  const taskId = app.activeTaskId;
  const provider = app.tasks.find((task) => task.id === taskId)?.provider;
  const missions = useMissionsStore.getState();
  const missionId = workspaceId && taskId ? missions.missionIdByTask[missionTaskKey(workspaceId, taskId)] : undefined;
  const running = missionId ? isActiveMissionState(missions.details[missionId]?.mission.state ?? "completed") : false;
  const actions: CommandPaletteAction[] = [];
  if (workspaceId && taskId && (provider === "claude-code" || provider === "codex") && !running) {
    actions.push({
      id: "mission.start",
      title: "Start mission…",
      subtitle: "Hand this task to a playbook that runs stage by stage",
      group: "task",
      icon: Target,
      keywords: ["mission", "playbook", "hand off", "handoff", "autopilot", "stages"],
      run: () => {
        const draft = useAppStore.getState().promptDraftByTask[taskId]?.text ?? "";
        usePlaybooksUiStore.getState().openStartSheet({ workspaceId, taskId, assignment: draft });
      },
    });
  }
  actions.push({
    id: "playbooks.manage",
    title: "Manage playbooks",
    subtitle: "Edit the stages your missions run",
    group: "navigation",
    icon: BookOpen,
    keywords: ["playbook", "mission", "stages", "automations"],
    run: () => usePlaybooksUiStore.getState().openPlaybooks(),
  });
  return actions;
}

/** Registers the mission entries once for the app's lifetime. */
export function useMissionCommands() {
  useEffect(() => registerCommandPaletteContributor(() => buildMissionCommandActions()), []);
}
