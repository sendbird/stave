import { readMessageIdTurnId } from "@/lib/session/message-id";
import type { AutoRoutingModelResolution } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

/**
 * The current turn (or the latest reply when idle) backs the composer's Auto
 * label. Agent runs write their model on the reply and mark their prompt
 * instead of using the renderer's Auto send path.
 */
export function findComposerAutoRoute(
  messages: readonly ChatMessage[],
  taskId: string,
  activeTurnId: string | undefined,
  liveTurnId: string | undefined,
) {
  const turnIdOf = (message: ChatMessage) =>
    message.turnId ?? message.steeredIntoTurnId ?? readMessageIdTurnId({ taskId, id: message.id });
  const replyIndex = messages.findLastIndex((message) =>
    message.role === "assistant" && message.providerId !== "user" &&
    message.model.length > 0 && (!activeTurnId || activeTurnId === turnIdOf(message)),
  );
  const reply = messages[replyIndex];
  if (!reply) return null;

  const turnId = turnIdOf(reply);
  let resolution = reply.modelResolution;
  let agentTurn = false;
  for (let index = replyIndex - 1; turnId && !resolution && index >= 0; index -= 1) {
    const message = messages[index]!;
    if (turnIdOf(message) !== turnId) break;
    if (message.role === "assistant") resolution = message.modelResolution;
    if (message.role === "user" && message.agentRunPrompt) agentTurn = true;
  }
  if (!resolution && !agentTurn && !(turnId && turnId === liveTurnId)) return null;

  // Keep the subscription stable while the contents of the reply stream.
  return {
    providerId: reply.providerId,
    model: reply.model,
    modelInfo: reply.modelInfo,
    resolution,
    turnId,
  };
}

export interface RecordedTurnRoute {
  resolution: AutoRoutingModelResolution;
  modelInfo: ChatMessage["modelInfo"];
  /** The user message the turn answered; empty when the transcript lost it. */
  prompt: string;
}

/**
 * The routing decision the transcript saved for one turn, matched by turn id
 * so a reloaded task draws the route of the turn it shows, not of the task's
 * latest send. Walks back from the end: the turn on screen is almost always
 * the last one.
 */
export function findRecordedTurnRoute(
  messages: readonly ChatMessage[],
  turnId: string | null | undefined,
): RecordedTurnRoute | null {
  if (!turnId) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.turnId !== turnId || message.role !== "assistant" || !message.modelResolution) continue;
    let prompt = "";
    for (let before = index - 1; before >= 0; before -= 1) {
      const candidate = messages[before]!;
      if (candidate.role === "user") {
        prompt = candidate.content;
        break;
      }
    }
    return { resolution: message.modelResolution, modelInfo: message.modelInfo, prompt };
  }
  return null;
}
