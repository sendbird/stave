import { i18n } from "@/i18n/runtime";
import type { AppNotification, AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import { isTarsNotificationKind } from "@/lib/notifications/notification.types";
import { collectTarsAttention, tarsDecisionSignalId } from "./attention";
import { tarsConfirmationRequestId } from "./conversation";
import { tarsAskDecisionId, tarsUnverifiedDecisionId } from "./decisions";
import type { TarsPendingDecision, TarsSnapshot } from "./types";

export interface TarsNotificationTarget { responsibilityId: string; decisionId?: string }

function decisionId(decision: TarsPendingDecision) {
  if (decision.kind === "unverifiedCompletion" || decision.messageId === null || decision.actionIndex === null) {
    return tarsUnverifiedDecisionId(decision.responsibilityId, decision.expectedRevision);
  }
  return decision.kind === "ask" ? tarsAskDecisionId(decision.messageId, decision.actionIndex)
    : tarsConfirmationRequestId(decision.messageId, decision.actionIndex);
}

/** Tray, Fleet and notifications read the same live facts, never action receipts. */
export function describeTarsNotifications(snapshot: TarsSnapshot): AppNotificationCreateInput[] {
  const decisions = new Map(snapshot.pendingDecisions.map((decision) => [tarsDecisionSignalId(decision), decisionId(decision)]));
  const signals = collectTarsAttention(snapshot);
  const decisionsByWork = new Set(signals.filter((signal) => signal.kind === "tars-decision").map((signal) => signal.responsibilityId));
  // As in Fleet, a decision already speaks for blocked work; announce it once.
  return signals.filter((signal) => signal.kind !== "tars-blocked" || !decisionsByWork.has(signal.responsibilityId)).map((signal) => {
    const kind = signal.kind === "tars-blocked" ? "tars.blocked"
      : signal.prompt?.kind === "resultReady" ? "tars.result_ready" : "tars.decision_requested";
    const title = signal.title.slice(0, 400);
    return {
      id: signal.id,
      kind,
      title: i18n.t(kind === "tars.blocked" ? "notifications:tars.blocked"
        : kind === "tars.result_ready" ? "notifications:tars.resultReady" : "notifications:tars.decisionRequested", { title }),
      body: title,
      repositoryPath: signal.repositoryPath,
      repositoryName: signal.repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) ?? null,
      workspaceId: signal.workspaceId,
      workspaceName: null,
      taskId: signal.taskId,
      taskTitle: title,
      turnId: null,
      providerId: null,
      action: null,
      payload: { source: "tars", tarsSignalId: signal.id, responsibilityId: signal.responsibilityId,
        ...(decisions.has(signal.id) ? { decisionId: decisions.get(signal.id) } : {}) },
      dedupeKey: signal.id,
    };
  });
}

/** Tars opens globally; a notification never switches to its execution task. */
export function readTarsNotificationTarget(notification: Pick<AppNotification, "kind" | "payload">): TarsNotificationTarget | null {
  const { responsibilityId, decisionId } = notification.payload;
  if (!isTarsNotificationKind(notification.kind) || typeof responsibilityId !== "string" || !responsibilityId) return null;
  return { responsibilityId, ...(typeof decisionId === "string" && decisionId ? { decisionId } : {}) };
}
