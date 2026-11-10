import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";
import { describeAgentIdentity } from "./format";

export interface DelegateRoutedModel {
  providerId: ProviderId;
  model: string;
  effort: string | null;
}

/**
 * Providers whose runtime rewrites an answer's `model` to the model the
 * provider itself reported (Claude's assistant messages, Codex's thread and
 * reroute notices). Elsewhere the transcript keeps the model Stave configured.
 */
const PROVIDERS_REPORTING_TURN_MODEL: ReadonlySet<ProviderId> = new Set(["claude-code", "codex"]);

/** Whether the answer holds anything the provider produced. */
function hasResponded(message: ChatMessage) {
  return Boolean(message.content.trim()) || (message.parts ?? []).some((part) =>
    (part.type === "text" && part.text.trim()) || part.type === "tool_use");
}

/**
 * The model a delegated task's turn ran on, read from that task's saved
 * transcript: the assistant row of its latest turn, else its last answer.
 * Null until the transcript is loaded or the turn has answered: before its
 * first response an answer row still carries the model it was started with.
 */
export function findDelegateRoutedModel(
  messages: readonly ChatMessage[],
  turnId?: string | null,
): DelegateRoutedModel | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || message.providerId === "user" || !message.model.trim()) continue;
    if (turnId && message.turnId !== turnId) continue;
    if (!hasResponded(message)) continue;
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

export interface DelegateIdentity {
  providerId?: ProviderId | null;
  model?: string | null;
  effort?: string | null;
  modelEvidence?: "requested" | "configured" | "reported";
  /** What the delegation asked for, only when it differs from what ran. */
  requested: string | null;
}

/**
 * The identity a delegation row leads with: the model that actually ran when
 * the delegated task's transcript has said so, else the requested one. The
 * effort stays the requested or configured tier; no provider reports it back.
 */
export function resolveDelegateIdentity(
  requested: {
    providerId?: ProviderId | null;
    model?: string | null;
    effort?: string | null;
    modelEvidence?: "requested" | "configured" | "reported";
  },
  routed: DelegateRoutedModel | null,
): DelegateIdentity {
  if (!routed) {
    return { providerId: requested.providerId, model: requested.model, effort: requested.effort, modelEvidence: requested.modelEvidence, requested: null };
  }
  return {
    providerId: routed.providerId,
    model: routed.model,
    effort: routed.effort ?? requested.effort,
    modelEvidence: PROVIDERS_REPORTING_TURN_MODEL.has(routed.providerId) ? "reported" : "configured",
    requested: describeDelegateRoute(requested, routed)?.requested ?? null,
  };
}
