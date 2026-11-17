import { useAppStore } from "@/store/app.store";
import type { CommandPaletteCommandHandlers } from "./command-palette-registry";

/** Request values never enter navigation; the bridge returns metadata only. */
export async function openSecretRequests(commands: CommandPaletteCommandHandlers) {
  const response = await window.api?.secretRequests?.list();
  const request = response?.ok ? response.requests[0] : null;
  if (!request) {
    commands.openSettings({ section: "secrets" });
    return;
  }
  if (request.workspaceId) {
    const state = useAppStore.getState();
    const repository = state.recentRepositories.find((item) =>
      item.workspaces.some((workspace) => workspace.id === request.workspaceId),
    );
    if (repository && repository.repositoryPath !== state.repositoryPath) {
      await commands.openRepository(repository.repositoryPath);
    }
    await commands.switchWorkspace(request.workspaceId);
  }
  commands.selectTask(request.taskId);
}
