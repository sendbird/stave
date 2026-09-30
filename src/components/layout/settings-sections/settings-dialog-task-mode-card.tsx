import { Badge } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { SettingsCard, SwitchField } from "../settings-dialog.shared";

/**
 * Settings → Chat → Agents: model-based tasks (default) or tasks run as agents
 * (experimental). See `src/lib/agents/task-mode.ts`.
 */
export function TaskModeCard() {
  const taskMode = useAppStore((state) => state.settings.taskMode);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <SettingsCard
      title="Agents"
      description="Hand a task to one of your agents instead of a model."
      titleAccessory={<Badge variant="outline">Experimental</Badge>}
    >
      <SwitchField
        title="Run tasks as agents"
        description={
          taskMode === "agentic"
            ? "Pick an agent from the model picker's Agents tab. It runs the task from the next turn, chooses its own model, and calls other agents itself, so there is no Worker while it runs."
            : "Pick a model for each task, as before. Your agents still run through Kickoff, delegation and playbooks."
        }
        checked={taskMode === "agentic"}
        onCheckedChange={(checked) => updateSettings({ patch: { taskMode: checked ? "agentic" : "model" } })}
      />
    </SettingsCard>
  );
}
