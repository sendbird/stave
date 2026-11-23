import { resolveFleetCurrentTaskControlState } from "@/lib/fleet/control-plane";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { buildShortQuestionAnswers, classifyFleetInlineInteraction } from "@/lib/fleet/inline-interaction";
import { getDelegatedAttentionRoot } from "@/lib/notifications/delegated-attention";
import { isTaskArchived, isTaskManaged } from "@/lib/tasks";
import type { AppState, InteractionAnswerOutcome } from "@/store/app-store.types";
import type { ApprovalPart, UserInputPart } from "@/types/chat";

export type BellAnswer = { approved: boolean } | { value: string };

export function classifyBellQuickAnswer(part: ApprovalPart | UserInputPart) {
  const inline = classifyFleetInlineInteraction(part, { min: 1, max: 4 });
  if (inline.kind === "short-question") {
    const { question } = inline;
    // All information required for a choice has to fit in the bell.
    if (inline.part.delivery === "async" ||
        question.allowCustom || question.linkUrl || question.question.length > 120 ||
        question.options.some(({ label, description, preview }) =>
          !label.trim() || label.length > 60 || (description?.length ?? 0) > 120 || preview
        ) || new Set(inline.options.map(({ value }) => value)).size !== inline.options.length) {
      return { kind: "open" } as const;
    }
  }
  return inline;
}

function getRequestIdentity(entry: FleetInboxEntry) {
  if (entry.kind !== "approval" && entry.kind !== "user-input") return null;
  const notification = entry.notifications.find((item) => !item.resolvedAt);
  if (entry.notifications.some(getDelegatedAttentionRoot)) return null;
  const requestId = entry.item?.requestId ?? notification?.action?.requestId ?? notification?.payload?.requestId;
  const messageId = entry.item?.messageId ?? notification?.action?.messageId ?? notification?.payload?.messageId;
  if (!entry.taskId || !entry.workspaceId || !entry.repositoryPath ||
      typeof requestId !== "string" || !requestId) {
    return null;
  }
  return {
    kind: entry.kind,
    taskId: entry.taskId,
    workspaceId: entry.workspaceId,
    repositoryPath: entry.repositoryPath,
    turnId: entry.item?.turnId ?? notification?.turnId,
    messageId: typeof messageId === "string" ? messageId : null,
    requestId,
  };
}

type BellRequest =
  | { status: "open" | "stale"; part?: undefined }
  | { status: "pending"; part: ApprovalPart | UserInputPart };

/** Inspect the owning session only. Opening the bell never hydrates a task. */
export function readBellRequest(state: AppState, entry: FleetInboxEntry): BellRequest {
  const expected = getRequestIdentity(entry);
  if (!expected || !state.hasHydratedWorkspaces) return { status: "open" };
  const current = resolveFleetCurrentTaskControlState({ state, expected });
  const session = state.activeWorkspaceId === expected.workspaceId
    ? state
    : state.workspaceRuntimeCacheById[expected.workspaceId];
  const task = current.taskId ? session?.tasks.find(({ id }) => id === current.taskId) : undefined;
  const message = current.messages.find(({ id }) => id === expected.messageId);
  const part = message?.parts.find(
    (candidate): candidate is ApprovalPart | UserInputPart =>
      (candidate.type === "approval" || candidate.type === "user_input") &&
      (expected.kind === "approval") === (candidate.type === "approval") &&
      candidate.requestId === expected.requestId,
  );

  if ((message && !part) || (part && part.state !== "approval-requested" && part.state !== "input-requested")) {
    return { status: "stale" };
  }
  if ((task && isTaskArchived(task)) || (part?.type === "user_input" && part.delivery === "async") ||
      entry.notifications.some((notification) => notification.payload?.delivery === "async")) {
    return { status: "open" };
  }
  // Managed tasks can retain host-owned requests without a renderer turn.
  if (task && isTaskManaged(task) && !current.turnId) return { status: "open" };
  if (!task || !current.turnId || (expected.turnId && current.turnId !== expected.turnId) ||
      (message?.turnId && message.turnId !== current.turnId) ||
      (part?.type === "approval" && part.expiresAt && Date.parse(part.expiresAt) <= Date.now())) {
    return { status: "stale" };
  }
  if (!part || !expected.turnId || !state.settings.notificationActionsEnabled) return { status: "open" };
  return { status: "pending", part };
}

export async function settleBellRequest(state: AppState, entry: FleetInboxEntry) {
  const resolvedAt = new Date().toISOString();
  const ids = new Set(entry.notifications.map(({ id }) => id));
  const results = await Promise.all(state.notifications
    .filter((notification) => !notification.resolvedAt && ids.has(notification.id))
    .map(({ id }) => state.markNotificationRead({ id, resolvedAt })));
  return results.every(Boolean);
}

export async function answerFromBell(
  getState: () => AppState,
  entry: FleetInboxEntry,
  answer: BellAnswer,
): Promise<InteractionAnswerOutcome> {
  const state = getState();
  const request = readBellRequest(state, entry);
  const identity = getRequestIdentity(entry);
  let outcome: InteractionAnswerOutcome | void = undefined;
  if (request.status === "stale") {
    outcome = { status: "skipped" };
  } else if (request.status === "pending" && identity?.messageId) {
    const inline = classifyBellQuickAnswer(request.part);
    const target = {
      taskId: identity.taskId,
      messageId: identity.messageId,
      requestId: identity.requestId,
      onUnanswerable: "close" as const,
    };
    if (inline.kind === "approval" && "approved" in answer) {
      outcome = await state.resolveApproval({ ...target, approved: answer.approved, scope: "once" });
    } else if (inline.kind === "short-question" && "value" in answer) {
      const option = inline.options.find(({ value }) => value === answer.value);
      if (option) {
        outcome = await state.resolveUserInput({ ...target, answers: buildShortQuestionAnswers(inline.question, option) });
      }
    }
  }
  // A card, the native notification, or turn teardown can win the race.
  if (outcome?.status === "skipped" ||
      (outcome?.status === "failed" && readBellRequest(getState(), entry).status === "stale")) {
    if (await settleBellRequest(getState(), entry)) return { status: "skipped" };
    return { status: "failed", message: "" };
  }
  return outcome ?? { status: "failed", message: "" };
}
