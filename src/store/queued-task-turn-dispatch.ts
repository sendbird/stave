import { hasPromptDraftPayload } from "@/store/prompt-draft-state";
import { normalizePromptDraftForStorage } from "@/store/prompt-draft-state";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { PromptDraft } from "@/types/chat";

interface QueuedTaskTurnActions {
  updatePromptDraft: (args: {
    taskId: string;
    patch: Partial<PromptDraft>;
  }) => void;
  sendUserMessage: (args: {
    taskId: string;
    content: string;
  }) => unknown;
  clearPromptDraft: (args: { taskId: string }) => void;
}

export function createQueuedTaskTurnDispatcher(args: {
  getSession: (workspaceId: string) => WorkspaceSessionState | null;
  getActions: () => QueuedTaskTurnActions;
}) {
  return (target: { workspaceId: string; taskId: string }) => {
    const queuedPromptDraft =
      args.getSession(target.workspaceId)?.promptDraftByTask[target.taskId];
    const [nextQueuedTurn, ...remainingQueuedTurns] =
      queuedPromptDraft?.queuedTurns ?? [];
    if (!nextQueuedTurn) {
      return;
    }

    const autoDispatchDraft = normalizePromptDraftForStorage({
      ...queuedPromptDraft,
      text: nextQueuedTurn.content,
      attachedFilePaths: nextQueuedTurn.attachedFilePaths,
      attachments: nextQueuedTurn.attachments,
      promptBatch: undefined,
      queuedTurns: remainingQueuedTurns,
    });
    const actions = args.getActions();
    actions.updatePromptDraft({
      taskId: target.taskId,
      patch: {
        text: autoDispatchDraft.text,
        attachedFilePaths: autoDispatchDraft.attachedFilePaths,
        attachments: autoDispatchDraft.attachments,
        promptBatch: undefined,
        queuedTurns:
          remainingQueuedTurns.length > 0 ? remainingQueuedTurns : undefined,
      },
    });
    if (hasPromptDraftPayload(autoDispatchDraft)) {
      void actions.sendUserMessage({
        taskId: target.taskId,
        content: autoDispatchDraft.text,
      });
    } else {
      actions.clearPromptDraft({ taskId: target.taskId });
    }
  };
}
