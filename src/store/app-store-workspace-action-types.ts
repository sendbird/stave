import type { PersistedTurnSummary } from "@/lib/db/turns.db";
import type { WorkspaceShell } from "@/lib/db/workspaces.db";
import type { ScriptTrigger } from "@/lib/workspace-scripts";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { StaleCachedWorkspaceRefresh } from "@/store/workspace-cache-freshness";

export type ReloadRefreshedWorkspaceTasks = (
  workspaceId: string,
  refresh: StaleCachedWorkspaceRefresh,
) => void;

export interface LoadedWorkspaceShellState {
  shell: WorkspaceShell | null;
  activeTaskIdForLatestHydration: string | null;
  latestTurns: PersistedTurnSummary[];
  initialTaskIds: string[];
  workspaceState: WorkspaceSessionState;
}

export type LoadWorkspaceShellStateFromPersistence = (args: {
  workspaceId: string;
}) => Promise<LoadedWorkspaceShellState>;

/** `unchanged`: nothing to load, not this workspace, or a load already running. */
export type TaskMessagesLoadResult = "loaded" | "unchanged" | "failed";

export type LoadTaskMessagesIntoSession = (args: {
  workspaceId: string;
  taskId: string;
  mode: "latest" | "older" | "newer";
  messageId?: string;
}) => Promise<TaskMessagesLoadResult>;

export type HydrateWorkspaceMessagesInBackground = (args: {
  workspaceId: string;
  taskIds: string[];
  latestTurns: PersistedTurnSummary[];
  switchMetricToken?: number;
}) => void;

export type RefreshWorkspaceFilesInBackground = (args: {
  workspaceId: string;
  workspacePath: string;
  switchMetricToken?: number;
}) => void;

export type RunScriptHookInBackground = (args: {
  workspaceId: string;
  trigger: ScriptTrigger;
  taskId?: string;
  taskTitle?: string;
  turnId?: string;
}) => void;
