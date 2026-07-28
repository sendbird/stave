import type { PersistedTurnSummary } from "@/lib/db/turns.db";
import type { WorkspaceShell } from "@/lib/db/workspaces.db";
import type { ScriptTrigger } from "@/lib/workspace-scripts";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

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

export type LoadTaskMessagesIntoSession = (args: {
  workspaceId: string;
  taskId: string;
  mode: "latest" | "older";
}) => Promise<void>;

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
