import { hasEndedTarsExecution, tarsContinuationBranch } from "@/lib/tars/continuation";
import type { TarsResponsibility } from "@/lib/tars/types";
import { useAppStore } from "@/store/app.store";

/** Show the host's expected branch when a follow-up would start another run. */
export function useTarsContinuationBranch(row?: TarsResponsibility) {
  const workspaceId = row?.executionWorkspaceId;
  const registered = useAppStore(state => {
    if (!workspaceId) return null;
    const repository = row?.repositoryPath === state.repositoryPath ? state : state.recentRepositories.find(item => item.repositoryPath === row?.repositoryPath);
    return repository?.workspaceBranchById[workspaceId];
  });
  return row && workspaceId && hasEndedTarsExecution(row) ? tarsContinuationBranch(row, registered) : null;
}
