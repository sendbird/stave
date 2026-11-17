import type { ChatMessage } from "@/types/chat";

/** Optional features a short tip may offer to turn on. */
export const FEATURE_TIP_IDS = ["steering", "checkpoints"] as const;
export type FeatureTipId = (typeof FEATURE_TIP_IDS)[number];

/** Keeps known tip ids once each; anything else in a stored snapshot is dropped. */
export function normalizeDismissedFeatureTips(value: unknown): FeatureTipId[] {
  if (!Array.isArray(value)) return [];
  return FEATURE_TIP_IDS.filter((id) => value.includes(id));
}

/**
 * The one message that may carry the file checkpoint tip: the latest finished
 * Claude reply, beside its turn actions. Earlier turns never repeat it.
 */
export function selectCheckpointTipMessageId(args: {
  messages: readonly Pick<ChatMessage, "id" | "role" | "providerId">[];
  activeTurnId?: string | null;
  checkpointingEnabled: boolean;
}): string | null {
  if (args.activeTurnId || args.checkpointingEnabled) return null;
  for (let index = args.messages.length - 1; index >= 0; index--) {
    const message = args.messages[index]!;
    if (message.role !== "assistant") continue;
    return message.providerId === "claude-code" ? message.id : null;
  }
  return null;
}
