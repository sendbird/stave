import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { ApprovalPart, ChatMessage, UserInputPart } from "@/types/chat";
import type {
  TaskAttentionFacts,
  TaskAttentionRequest,
  TaskAttentionRequestOwner,
} from "./derive-task-attention";

/** A pending chat part can survive its response route. The caller verifies that route. */
export function taskAttentionRequestFromPart(
  message: Pick<ChatMessage, "id" | "turnId">,
  part: ApprovalPart | UserInputPart,
  owner: TaskAttentionRequestOwner | null,
  since: string | null = null,
): TaskAttentionRequest | null {
  const pending = part.type === "approval"
    ? part.state === "approval-requested" && part.prompted !== false
    : part.state === "input-requested";
  if (!pending || !part.requestId.trim()) return null;

  const kind = part.type === "approval" ? "approval" : "user-input";
  return {
    id: JSON.stringify([kind, message.turnId ?? message.id, part.requestId]),
    kind,
    owner: owner?.kind === "live-turn" && owner.turnId !== message.turnId ? null : owner,
    since,
  };
}

/** Only activity for the current turn can establish its start and stall times. */
export function taskAttentionFactsFromTurnActivity(
  activeTurnId: string | null | undefined,
  activity: Pick<ProviderTurnActivitySnapshot, "turnId" | "startedAt" | "stalledAt"> | null | undefined,
): Pick<TaskAttentionFacts, "activeTurnId" | "activeTurnStartedAt" | "turnStall"> {
  if (!activeTurnId || activity?.turnId !== activeTurnId) return { activeTurnId };
  return {
    activeTurnId,
    activeTurnStartedAt: new Date(activity.startedAt).toISOString(),
    turnStall: activity.stalledAt === null
      ? null
      : { turnId: activeTurnId, since: new Date(activity.stalledAt).toISOString() },
  };
}

/** Pass the latest eligible turn's receipt after applying task/controller scope. */
export function taskAttentionFactsFromTurnReceipt(
  message: Pick<ChatMessage, "turnId" | "terminalReceipt">,
): Pick<TaskAttentionFacts, "turnFailure" | "lastResultAt"> {
  const { turnId, terminalReceipt } = message;
  if (!turnId || !terminalReceipt?.completedAt) return {};
  if (terminalReceipt.outcome === "failed") {
    return { turnFailure: { turnId, since: terminalReceipt.completedAt } };
  }
  return terminalReceipt.outcome === "completed" ? { lastResultAt: terminalReceipt.completedAt } : {};
}
