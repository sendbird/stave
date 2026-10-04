import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import {
  ATTACHED_TASK_MESSAGE_PAGE,
  MAX_ATTACHED_TASKS,
  buildAttachedTaskRetrievedContext,
  buildAttachedTaskSection,
  type TaskContextAttachment,
} from "@/lib/task-context/attached-task-context";
import { buildReferencedTaskRetrievedContext } from "@/lib/task-context/referenced-task-context";
import type { AppState } from "@/store/app-store.types";
import { getPromptDraftAttachments } from "@/store/prompt-draft-context";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import type { ChatMessage, PromptDraft, Task } from "@/types/chat";

/** A task's messages for context: loaded ones, else its newest stored page. */
export async function readAttachedTaskMessages(args: {
  getState: () => AppState;
  attachment: Pick<TaskContextAttachment, "taskId" | "workspaceId">;
}): Promise<ChatMessage[]> {
  const loaded = getWorkspaceSessionForState({
    state: args.getState(),
    workspaceId: args.attachment.workspaceId,
  })?.messagesByTask[args.attachment.taskId];
  if (loaded && loaded.length > 0) {
    return loaded;
  }
  // Most tasks are not loaded; their newest page is read from disk instead of
  // being pulled into the store.
  const page = await loadTaskMessagesPage({
    workspaceId: args.attachment.workspaceId,
    taskId: args.attachment.taskId,
    limit: ATTACHED_TASK_MESSAGE_PAGE,
    offset: 0,
  }).catch(() => null);
  return page?.messages ?? [];
}

/**
 * Retrieved context for the tasks a prompt points at: tasks attached with `@`
 * or by drag (any workspace), and task ids written in the text (this one).
 */
export async function collectTaskReferenceContextParts(args: {
  getState: () => AppState;
  prompt: string;
  promptDraft: PromptDraft;
  currentTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
}): Promise<CanonicalRetrievedContextPart[]> {
  const parts: CanonicalRetrievedContextPart[] = [];
  const attached = getPromptDraftAttachments(args.promptDraft)
    .filter(
      (attachment): attachment is TaskContextAttachment =>
        attachment.kind === "task-context" &&
        attachment.taskId !== args.currentTaskId,
    )
    .filter(
      (attachment, index, all) =>
        all.findIndex((other) => other.taskId === attachment.taskId) === index,
    )
    .slice(0, MAX_ATTACHED_TASKS);
  if (attached.length > 0) {
    const sections: string[] = [];
    const missing: string[] = [];
    const loaded = await Promise.all(
      attached.map(async (attachment) => ({
        attachment,
        messages: await readAttachedTaskMessages({
          getState: args.getState,
          attachment,
        }),
      })),
    );
    for (const { attachment, messages } of loaded) {
      const section = buildAttachedTaskSection({ attachment, messages });
      if (section) {
        sections.push(section);
      } else {
        missing.push(attachment.title);
      }
    }
    const context = buildAttachedTaskRetrievedContext({ sections, missing });
    if (context) {
      parts.push(context);
    }
  }
  const referenced = buildReferencedTaskRetrievedContext({
    prompt: args.prompt,
    currentTaskId: args.currentTaskId,
    tasks: args.tasks,
    messagesByTask: args.messagesByTask,
  });
  if (referenced) {
    parts.push(referenced);
  }
  return parts;
}
