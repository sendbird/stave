import { useAsync, type AsyncState } from "@/components/ads/utils/async";
import { useAppStore } from "@/store/app.store";

export interface WorkspaceScriptOption {
  id: string;
  label: string;
  description: string;
}

/**
 * The action scripts of the workspace in view, read through the scripts
 * bridge. Without a workspace (or a bridge) there is nothing to read, which is
 * different from a read that failed or a workspace without actions.
 */
export type WorkspaceScriptActions =
  | { available: false }
  | { available: true; state: AsyncState<WorkspaceScriptOption[]>; refresh: () => void };

export function useWorkspaceScriptActions(): WorkspaceScriptActions {
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const workspacePath = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? null);
  const getConfig = typeof window === "undefined" ? undefined : window.api?.scripts?.getConfig;
  const { state, refresh } = useAsync(async () => {
    if (!getConfig || !repositoryPath || !workspacePath) return [];
    const result = await getConfig({ repositoryPath, workspacePath });
    if (!result.ok) throw new Error(result.error || "scripts unavailable"); // i18n-ignore: replaced by the boundary's own words
    return (result.config?.actions ?? []).map((entry) => ({ id: entry.id, label: entry.label || entry.id, description: entry.description }));
  }, [getConfig, repositoryPath, workspacePath]);
  return getConfig && repositoryPath && workspacePath ? { available: true, state, refresh } : { available: false };
}

/** The scripts once read; nothing while reading, after a failed read or without a workspace. */
export function readyWorkspaceScripts(actions: WorkspaceScriptActions): WorkspaceScriptOption[] {
  return actions.available && actions.state.status === "ready" ? actions.state.data : [];
}
