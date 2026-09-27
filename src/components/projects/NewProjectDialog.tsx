import { useRef, useState } from "react";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Switch } from "@/components/ads/components/Switch";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { Segmented } from "@/components/playbooks/Segmented";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROJECT_LIMITS } from "@/lib/projects/domain";
import { useAppStore } from "@/store/app.store";
import { useProjectsStore } from "@/store/projects-store";
import { projectStyles as styles } from "./projects.styles";

type CoordinatorChoice = "claude-code" | "codex" | "current";

/**
 * A project starts from a goal. Stave gives it a coordinator — a new task, or
 * the one in view — that plans missions from the goal and follows them.
 */
export function NewProjectDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createProject = useProjectsStore((state) => state.create);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTask = useAppStore((state) => state.tasks.find((task) => task.id === state.activeTaskId) ?? null);
  const workspaceName = useAppStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
  );
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const currentSupported = activeTask?.provider === "claude-code" || activeTask?.provider === "codex";
  const [choice, setChoice] = useState<CoordinatorChoice>("claude-code");
  const coordinator = choice === "current" && !currentSupported ? "claude-code" : choice;
  const [askBeforeStarting, setAskBeforeStarting] = useState(true);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The coordinator task an attempt that failed already made; a retry reuses
  // it instead of leaving one more empty task behind.
  const madeTask = useRef<{ workspaceId: string; taskId: string } | null>(null);

  /** The coordinator's task: the one in view, the one an earlier attempt made, or a new one. */
  const prepareCoordinatorTask = (workspaceId: string): string | null => {
    const title = `Coordinator · ${name.trim()}`;
    if (coordinator === "current") return activeTask?.id ?? null;
    const store = useAppStore.getState();
    const earlier = madeTask.current;
    if (earlier?.workspaceId === workspaceId && store.tasks.some((task) => task.id === earlier.taskId)) {
      store.renameTask({ taskId: earlier.taskId, title });
      store.setTaskProvider({ taskId: earlier.taskId, provider: coordinator });
      return earlier.taskId;
    }
    const previous = store.activeTaskId;
    store.createTask({ title });
    const taskId = useAppStore.getState().activeTaskId;
    if (!taskId || taskId === previous) return null;
    madeTask.current = { workspaceId, taskId };
    useAppStore.getState().setTaskProvider({ taskId, provider: coordinator });
    return taskId;
  };

  const submit = async () => {
    if (!activeWorkspaceId || creating) return;
    setCreating(true);
    setFailure(null);
    try {
      const taskId = prepareCoordinatorTask(activeWorkspaceId);
      if (!taskId) {
        setFailure("The coordinator task could not be created.");
        return;
      }
      // The host reads the task from the saved workspace.
      await useAppStore.getState().flushActiveWorkspaceSnapshot();
      const response = await createProject({
        name: name.trim(),
        goal: goal.trim(),
        coordinator: { workspaceId: activeWorkspaceId, taskId },
        settings: { askBeforeStarting },
      });
      if (!response.ok) {
        setFailure(response.message ?? "The project could not be created.");
        return;
      }
      madeTask.current = null;
      useAppStore.getState().openProjects();
      props.onOpenChange(false);
      setName("");
      setGoal("");
    } catch (error) {
      setFailure(error instanceof Error && error.message ? error.message : "The project could not be created.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => !creating && props.onOpenChange(open)}>
      <DialogContent showCloseButton={!creating}>
        <DialogHeader>
          <DialogTitle>
            <span className={sx(styles.titleRow)}>
              <FolderKanban aria-hidden className={sx(styles.icon)} />
              New project
            </span>
          </DialogTitle>
          <DialogDescription>
            A goal that takes several missions. The coordinator plans them in {workspaceName ?? "this workspace"}; each
            mission runs on its own worktree.
          </DialogDescription>
        </DialogHeader>
        <div className={sx(styles.dialogBody)}>
          <TextField
            label="Name"
            size="sm"
            value={name}
            maxLength={PROJECT_LIMITS.name}
            placeholder="Dashboard design-system move"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <Textarea
            label="Goal"
            description="What done looks like. The coordinator breaks it into missions."
            size="sm"
            value={goal}
            maxLength={PROJECT_LIMITS.goal}
            autoResize
            maxRows={8}
            placeholder="Every dashboard screen uses the new components; no legacy imports remain."
            onChange={(event) => setGoal(event.target.value)}
          />
          <div className={sx(styles.field)}>
            <span className={sx(styles.fieldLabel)}>Coordinator</span>
            <Segmented<CoordinatorChoice>
              aria-label="Coordinator"
              value={coordinator}
              options={[
                { value: "claude-code", label: "New Claude task" },
                { value: "codex", label: "New Codex task" },
                ...(currentSupported ? [{ value: "current" as const, label: "Task in view" }] : []),
              ]}
              onChange={setChoice}
            />
            <p className={sx(styles.hint)}>
              {coordinator === "current"
                ? `“${activeTask?.title}” plans the missions and follows them. It edits no files.`
                : "A new task plans the missions and follows them. It edits no files."}
            </p>
          </div>
          <div className={sx(styles.optionRow)}>
            <span className={sx(styles.rowText)}>
              <span className={sx(styles.fieldLabel)}>Ask before starting each mission</span>
              <span className={sx(styles.hint)}>Recommended while you get to know the coordinator. Change it later in Settings.</span>
            </span>
            <Switch aria-label="Ask before starting each mission" checked={askBeforeStarting} onCheckedChange={setAskBeforeStarting} />
          </div>
          {failure ? (
            <p className={sx(styles.error)} role="alert">
              {failure}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="quiet" size="sm" disabled={creating} onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || !goal.trim() || !activeWorkspaceId || creating}
            loading={creating}
            onClick={() => void submit()}
          >
            Create and plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
