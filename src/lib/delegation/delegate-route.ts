import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";
import { describeAgentIdentity } from "./format";

export interface DelegateRoutedModel {
  providerId: ProviderId;
  model: string;
  effort: string | null;
}

/**
 * The model a delegated task's turn ran on, read from that task's saved
 * transcript: the assistant row of its latest turn, else its last answer.
 * Null until the transcript is loaded or the turn has said which model ran.
 */
export function findDelegateRoutedModel(
  messages: readonly ChatMessage[],
  turnId?: string | null,
): DelegateRoutedModel | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || message.providerId === "user" || !message.model.trim()) continue;
    if (turnId && message.turnId !== turnId) continue;
    return { providerId: message.providerId, model: message.model, effort: message.modelInfo?.effort ?? null };
  }
  return null;
}

/**
 * `Claude Sonnet 5 · High` when routing ran something other than what the
 * delegation asked for; null when the two read the same, so the row names the
 * model once.
 */
export function describeDelegateRoute(
  requested: { providerId?: ProviderId | null; model?: string | null; effort?: string | null },
  routed: DelegateRoutedModel | null,
): { requested: string; routed: string } | null {
  if (!routed) return null;
  const asked = describeAgentIdentity(requested);
  const ran = describeAgentIdentity(routed);
  const sameModel = asked.modelLabel === ran.modelLabel && (requested.providerId ?? routed.providerId) === routed.providerId;
  // A transcript that kept no effort says nothing about it, not that it dropped.
  const sameEffort = ran.effortLabel === null || asked.effortLabel === ran.effortLabel;
  return sameModel && sameEffort ? null : { requested: asked.text, routed: ran.text };
}
