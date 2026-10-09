/**
 * A task a supervisor adds without starting a turn, and the model a task runs
 * on. Pure over the workspace session, so `local-mcp-runtime.ts` only loads
 * and persists.
 *
 * Used by: `electron/host-service/local-mcp-runtime.ts`.
 */
import { randomUUID } from "node:crypto";
import { getDefaultModelForProvider, inferProviderIdFromModel } from "../../src/lib/providers/model-catalog";
import type { ProviderId } from "../../src/lib/providers/provider.types";
import { buildRecentTimestamp } from "../../src/store/chat-state-helpers";
import type { WorkspaceSessionState } from "../../src/store/workspace-session-state";
import type { ChatMessage, PromptDraft, Task } from "../../src/types/chat";

/**
 * The session with a new, idle task. With `model`, the task's composer starts
 * on that model, so the task — and an agent run on it — runs there.
 */
export function addIdleTask(
  session: WorkspaceSessionState,
  args: { title: string; provider: ProviderId; model?: string | null; taskId?: string; parentTaskId?: string },
): { session: WorkspaceSessionState; taskId: string } {
  const existing = args.taskId ? session.tasks.find((task) => task.id === args.taskId) : null;
  if (existing) {
    if (!args.parentTaskId || existing.parentTaskId !== args.parentTaskId || existing.provider !== args.provider || existing.archivedAt || existing.controlMode !== "managed")
      throw new Error("The delegated task identity changed before supervision could start.");
    return { session, taskId: existing.id };
  }
  const task = {
    id: args.taskId ?? randomUUID(),
    title: args.title.trim().slice(0, 80) || "Run",
    provider: args.provider,
    updatedAt: buildRecentTimestamp(),
    unread: false,
    archivedAt: null,
    controlMode: args.parentTaskId ? "managed" : "interactive",
    controlOwner: args.parentTaskId ? "external" : "stave",
    ...(args.parentTaskId ? { parentTaskId: args.parentTaskId } : {}),
  } satisfies Task;
  const draft: PromptDraft | null = args.model
    ? { text: "", attachedFilePaths: [], attachments: [], runtimeOverrides: { model: args.model, modelProviderId: args.provider } }
    : null;
  return {
    taskId: task.id,
    session: {
      ...session,
      tasks: [task, ...session.tasks],
      messagesByTask: { ...session.messagesByTask, [task.id]: [] },
      nativeSessionReadyByTask: { ...session.nativeSessionReadyByTask, [task.id]: false },
      ...(draft ? { promptDraftByTask: { ...session.promptDraftByTask, [task.id]: draft } } : {}),
    },
  };
}

/**
 * The model a task runs on: its latest message's, else the model its composer
 * is set to (when it belongs to the task's provider), else the provider default
 * — what `runTask` itself would resolve.
 */
export function resolveTaskModel(args: {
  messages: readonly ChatMessage[];
  draft: PromptDraft | undefined;
  providerId: ProviderId;
}): string {
  const latest = [...args.messages].reverse().find((message) => Boolean(message.model))?.model?.trim();
  if (latest) return latest;
  const drafted = args.draft?.runtimeOverrides?.model?.trim();
  const draftedProvider =
    args.draft?.runtimeOverrides?.modelProviderId ?? (drafted ? inferProviderIdFromModel({ model: drafted }) : null);
  if (drafted && draftedProvider === args.providerId) return drafted;
  return getDefaultModelForProvider({ providerId: args.providerId });
}
