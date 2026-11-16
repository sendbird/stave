import { loadRepositoryRegistryState } from "@/lib/db/workspaces.db";
import { normalizeRecentRepositoryStates, type RecentRepositoryState } from "@/store/repository.utils";
import { archivedWorktreePaths } from "@/store/workspace-archive-cleanup";
import { useAppStore } from "@/store/app.store";

/** Replace the renderer mirror only after the host has committed its registry. */
export async function refreshWorkspaceCleanupRegistry(store: Pick<typeof useAppStore, "getState" | "setState"> = useAppStore, options: {preserveActiveWorkspace?:boolean} = {}) {
  const registry = await loadRepositoryRegistryState();
  const repositories = normalizeRecentRepositoryStates({ repositories: registry.repositories as RecentRepositoryState[] });
  const state = store.getState();
  const current = repositories.find((repository) => repository.repositoryPath === state.repositoryPath);
  archivedWorktreePaths.clear();
  store.setState({
    recentRepositories: repositories,
    ...(current ? {
      workspaces: current.workspaces,
      workspaceBranchById: current.workspaceBranchById,
      workspacePathById: current.workspacePathById,
      workspaceDefaultById: current.workspaceDefaultById,
    } : {}),
  });
  if (!options.preserveActiveWorkspace && current && !current.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)) {
    const replacement = current.workspaces.find((workspace) => current.workspaceDefaultById[workspace.id]) ?? current.workspaces[0];
    if (replacement) await store.getState().switchWorkspace({ workspaceId: replacement.id });
  }
}

/** Seed a fresh branch with a reviewable draft; the original history stays intact. */
export async function createWorkspaceFromHistory(args: { workspaceId: string; repositoryPath: string }) {
  const { loadWorkspaceShell, loadAllTaskMessages } = await import("@/lib/db/workspaces.db");
  const shell = await loadWorkspaceShell({ workspaceId: args.workspaceId });
  if (!shell) throw new Error("Workspace history is unavailable"); // i18n-ignore: diagnostic
  const transcripts: string[] = [];
  for (const task of shell.tasks) {
    const messages = await loadAllTaskMessages({ workspaceId: args.workspaceId, taskId: task.id });
    transcripts.push(`## ${task.title}\n${messages.map((message) => `${message.role}: ${message.content}`).join("\n\n")}`);
  }
  if (useAppStore.getState().repositoryPath !== args.repositoryPath) {
    await useAppStore.getState().openRepository({ repositoryPath: args.repositoryPath });
  }
  // i18n-ignore: model-facing draft, user reviews before sending
  const result = await useAppStore.getState().createWorkspace({
    name: `restored-history-${Date.now()}`,
    mode: "branch",
    workspaceInformation: shell.workspaceInformation,
    initialPromptDraft: {
      // i18n-ignore: model-facing draft reviewed before sending
      text: `Continue from this retained workspace history. Review the current checkout before changing files.\n\n${transcripts.join("\n\n")}`,
      attachedFilePaths: [], attachments: [],
    },
  });
  if (!result.ok) throw new Error(result.message ?? "Workspace creation failed"); // i18n-ignore: diagnostic
  return result;
}
