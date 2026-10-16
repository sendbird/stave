import type { AutoRoutingModelResolution } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

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
