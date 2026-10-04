import { toast } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

/**
 * Opens a task a chip attached as context, the same way a subagent row or a
 * Fleet link opens one. A chip only names a workspace, not a project, so a
 * task from a workspace this project does not list is not switched to.
 */
export async function openAttachedTask(args: { taskId: string; workspaceId: string }) {
  let state = useAppStore.getState();
  const known = () =>
    useAppStore.getState().workspaces.some((workspace) => workspace.id === args.workspaceId);
  if (!known()) {
    // A worktree created a moment ago appears in git before this list.
    await state.refreshWorkspaces();
    state = useAppStore.getState();
  }
  if (!known()) {
    toast.info("Open the project that task belongs to, then open it from there.");
    return;
  }
  await state.focusTaskAttention({
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    repositoryPath: state.repositoryPath ?? undefined,
    refreshFromPersistence: true,
  });
}
