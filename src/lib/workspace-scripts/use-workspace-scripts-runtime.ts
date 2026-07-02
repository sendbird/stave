// ---------------------------------------------------------------------------
// Workspace Scripts – React binding for the runtime store
// ---------------------------------------------------------------------------

import { useCallback, useSyncExternalStore } from "react";
import {
  acquireScriptsRuntime,
  EMPTY_SNAPSHOT,
  getScriptsRuntimeSnapshot,
  subscribeScriptsRuntime,
  type ScriptsRuntimeContext,
  type ScriptsRuntimeSnapshot,
} from "./runtime-store";

/**
 * Subscribe a component to a workspace's scripts runtime.
 *
 * Pass `null` when there is no active workspace (returns the shared empty
 * snapshot without acquiring anything). Acquisition/refcounting is driven
 * through `useSyncExternalStore`'s subscribe callback so the record — and its
 * single IPC subscription — is created before the store listener attaches and
 * torn down when the last consumer unsubscribes.
 */
export function useWorkspaceScriptsRuntime(
  args: ScriptsRuntimeContext | null,
): ScriptsRuntimeSnapshot {
  const workspaceId = args?.workspaceId ?? null;
  const projectPath = args?.projectPath ?? "";
  const workspacePath = args?.workspacePath ?? "";
  const workspaceName = args?.workspaceName ?? "";
  const branch = args?.branch ?? "";

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!workspaceId) {
        return () => {};
      }
      const release = acquireScriptsRuntime({
        workspaceId,
        projectPath,
        workspacePath,
        workspaceName,
        branch,
      });
      const unsubscribe = subscribeScriptsRuntime(workspaceId, onStoreChange);
      return () => {
        unsubscribe();
        release();
      };
    },
    [workspaceId, projectPath, workspacePath, workspaceName, branch],
  );

  const getSnapshot = useCallback(
    () => (workspaceId ? getScriptsRuntimeSnapshot(workspaceId) : EMPTY_SNAPSHOT),
    [workspaceId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
