import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type {
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { ChatMessage, EditorTab, PromptDraft, Task } from "@/types/chat";
import {
  interruptActiveTaskTurns,
  persistWorkspaceSnapshot,
  WORKSPACE_SWITCH_TURN_NOTICE,
} from "@/store/workspace-session-state";

function getActiveTurnIds(args: {
  activeTurnIdsByTask: Record<string, string | undefined>;
  taskIds: string[];
}) {
  const turnIds: string[] = [];

  for (const taskId of args.taskIds) {
    const turnId = args.activeTurnIdsByTask[taskId];
    if (turnId) {
      turnIds.push(turnId);
    }
  }

  return turnIds;
}

export async function interruptWorkspaceTurnsBeforeTransition(args: {
  activeWorkspaceId: string;
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation?: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  terminalDocked: boolean;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  workspaceName: string;
  applyInterruptedState: (args: {
    messagesByTask: Record<string, ChatMessage[]>;
    activeTurnIdsByTask: Record<string, string | undefined>;
  }) => void;
}) {
  const interrupted = interruptActiveTaskTurns({
    tasks: args.tasks,
    messagesByTask: args.messagesByTask,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
    notice: WORKSPACE_SWITCH_TURN_NOTICE,
  });

  if (interrupted.interruptedTaskIds.length > 0) {
    args.applyInterruptedState({
      messagesByTask: interrupted.messagesByTask,
      activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
    });

    const abortTurn = window.api?.provider?.abortTurn;
    const cleanupTask = window.api?.provider?.cleanupTask;

    if (abortTurn) {
      await Promise.all(
        getActiveTurnIds({
          activeTurnIdsByTask: args.activeTurnIdsByTask,
          taskIds: interrupted.interruptedTaskIds,
        }).map((turnId) => abortTurn({ turnId }))
      );
    }

    if (cleanupTask) {
      await Promise.all(
        interrupted.interruptedTaskIds.map((taskId) => cleanupTask({ taskId }))
      );
    }
  }

  await persistWorkspaceSnapshot({
    workspaceId: args.activeWorkspaceId,
    workspaceName: args.workspaceName,
    activeTaskId: args.activeTaskId,
    tasks: args.tasks,
    messagesByTask: interrupted.messagesByTask,
    promptDraftByTask: args.promptDraftByTask,
    workspaceInformation: args.workspaceInformation,
    editorTabs: args.editorTabs,
    activeEditorTabId: args.activeEditorTabId,
    terminalTabs: args.terminalTabs,
    activeTerminalTabId: args.activeTerminalTabId,
    terminalDocked: args.terminalDocked,
    cliSessionTabs: args.cliSessionTabs,
    activeCliSessionTabId: args.activeCliSessionTabId,
    activeSurface: args.activeSurface,
    providerSessionByTask: args.providerSessionByTask,
  });

  return interrupted.interruptedTaskIds;
}
