import { i18n } from "@/i18n/runtime";
import { loadAllTaskMessages, truncateTaskMessagesAfter } from "@/lib/db/workspaces.db";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { getProviderSessionCursor, setProviderSessionEntry } from "@/lib/providers/provider-sessions";
import { useAppStore } from "@/store/app.store";
import { trimLoadedTaskMessages } from "@/store/task-message-loading";
import type { ChatMessage } from "@/types/chat";

type Target = { taskId: string; messageId: string };
type Failure = { ok: false; detail: string };
type Plan = {
  ok: true;
  taskId: string;
  workspaceId: string;
  turnId: string;
  numTurns: number;
  threadId: string;
  accountProfileId: string;
  boundaryMessageId: string;
  remaining: ChatMessage[];
};
const busyTasks = new Set<string>();
const failure = (key: "unavailable" | "mixed" | "running" | "metadata"): Failure => ({ ok: false, detail: i18n.t(`app:turnFileConversation.${key}`) });

async function planBeforeTurn(args: Target): Promise<Plan | Failure> {
  const state = useAppStore.getState();
  const workspaceId = state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId;
  if (!workspaceId || workspaceId !== state.activeWorkspaceId || !state.tasks.some((task) => task.id === args.taskId)) return failure("unavailable");
  if (state.activeTurnIdsByTask[args.taskId]) return failure("running");
  const loaded = state.messagesByTask[args.taskId];
  const total = state.messageCountByTask[args.taskId] ?? loaded?.length ?? 0;
  const messages = loaded && loaded.length >= total ? loaded : await loadAllTaskMessages({ workspaceId, taskId: args.taskId });
  const targetIndex = messages.findIndex((message) => message.id === args.messageId);
  const target = messages[targetIndex];
  if (!target || target.role !== "assistant" || target.providerId !== "codex") return failure("unavailable");
  if (!target.turnId || !target.nativeProviderTurnId || !target.nativeProviderSessionId) return failure("metadata");
  const boundary = messages.findIndex((message) => message.role === "user" && message.turnId === target.turnId && !message.steeredIntoTurnId);
  if (boundary < 0 || boundary >= targetIndex) return failure("metadata");
  const accountProfileId = target.nativeAccountProfileId ?? SYSTEM_ACCOUNT_PROFILE_ID;
  const current = useAppStore.getState();
  if (current.activeWorkspaceId !== workspaceId || current.activeTurnIdsByTask[args.taskId]) return failure("running");
  const cursor = getProviderSessionCursor({ sessions: current.providerSessionByTask[args.taskId], providerId: "codex", accountProfileId });
  if (!cursor || cursor.nativeSessionId !== target.nativeProviderSessionId || !window.api?.provider?.rollbackCodexThread) return failure("unavailable");
  const removed = messages.slice(boundary).filter((message) => message.role === "assistant");
  if (removed.some((message) => message.providerId !== "codex" || message.nativeProviderSessionId !== cursor.nativeSessionId ||
      (message.nativeAccountProfileId ?? SYSTEM_ACCOUNT_PROFILE_ID) !== accountProfileId)) return failure("mixed");
  if (removed.some((message) => !message.turnId || !message.nativeProviderTurnId || message.isStreaming)) return failure("metadata");
  return {
    ok: true, taskId: args.taskId, workspaceId, turnId: target.turnId,
    numTurns: new Set(removed.map((message) => message.nativeProviderTurnId!)).size,
    threadId: cursor.nativeSessionId, accountProfileId,
    boundaryMessageId: messages[boundary]!.id, remaining: messages.slice(0, boundary),
  };
}

/** Resolve capability and the exact native suffix before a file restore is offered. */
export async function getRestoreConversationBeforeTurnPlan(args: Target): Promise<{ ok: true; turnId: string; numTurns: number } | Failure> {
  try {
    if (busyTasks.has(args.taskId)) return failure("running");
    const plan = await planBeforeTurn(args);
    return plan.ok ? { ok: true, turnId: plan.turnId, numTurns: plan.numTurns } : plan;
  } catch { return failure("unavailable"); }
}

/** Roll back the selected turn itself, including its user prompt and every later turn. */
export async function restoreConversationBeforeTurn(args: Target): Promise<{ ok: boolean; detail: string }> {
  if (busyTasks.has(args.taskId)) return failure("running");
  busyTasks.add(args.taskId);
  try {
    const plan = await planBeforeTurn(args);
    if (!plan.ok) return plan;
    const state = useAppStore.getState();
    const result = await window.api!.provider!.rollbackCodexThread!({
      threadId: plan.threadId, numTurns: plan.numTurns,
      runtimeOptions: { codexAccountProfileId: plan.accountProfileId, codexBinaryPath: state.settings.codexBinaryPath || undefined },
    });
    if (!result.ok) return { ok: false, detail: result.detail };
    let persistenceError: string | null = null;
    try {
      await truncateTaskMessagesAfter({ workspaceId: plan.workspaceId, taskId: args.taskId, messageId: plan.boundaryMessageId, before: true });
    } catch (error) { persistenceError = String(error); }
    const retained = plan.remaining.findLast((message) => message.role === "assistant" && message.providerId === "codex" &&
      message.nativeProviderSessionId === plan.threadId && (message.nativeAccountProfileId ?? SYSTEM_ACCOUNT_PROFILE_ID) === plan.accountProfileId);
    useAppStore.setState((current) => ({
      messagesByTask: { ...current.messagesByTask, [args.taskId]: trimLoadedTaskMessages({ messages: plan.remaining }) },
      messageCountByTask: { ...current.messageCountByTask, [args.taskId]: plan.remaining.length },
      providerSessionByTask: { ...current.providerSessionByTask, [args.taskId]: setProviderSessionEntry({
        sessions: current.providerSessionByTask[args.taskId], providerId: "codex", accountProfileId: plan.accountProfileId,
        entry: { nativeSessionId: plan.threadId, ...(retained ? { syncedThroughMessageId: retained.id } : {}) },
      }) },
      providerGoalByTask: { ...current.providerGoalByTask, [args.taskId]: null },
      nativeSessionReadyByTask: { ...current.nativeSessionReadyByTask, [args.taskId]: true },
      workspaceSnapshotVersion: current.workspaceSnapshotVersion + 1,
    }));
    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    return persistenceError ? { ok: false, detail: i18n.t("app:threadActions.persistenceFailure", { detail: persistenceError }) }
      : { ok: true, detail: i18n.t("app:turnFileConversation.restored") };
  } catch { return failure("unavailable"); }
  finally { busyTasks.delete(args.taskId); }
}
