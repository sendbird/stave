import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import { getProviderThreadActionCapabilities } from "@/lib/providers/model-catalog";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

export interface ConversationTurnActionAvailability {
  enabled: boolean;
  reason: string;
  rollbackTurnCount?: number;
}

export interface ConversationTurnActionState {
  fork: ConversationTurnActionAvailability;
  rollback: ConversationTurnActionAvailability;
}

const MAX_PROVIDER_SESSION_TITLE_LENGTH = 200;

export function toProviderSessionTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= MAX_PROVIDER_SESSION_TITLE_LENGTH) {
    return trimmed;
  }
  const truncated = trimmed.slice(0, MAX_PROVIDER_SESSION_TITLE_LENGTH);
  return (
    /[\uD800-\uDBFF]$/.test(truncated) ? truncated.slice(0, -1) : truncated
  ).trimEnd();
}

function unavailable(reason: string): ConversationTurnActionAvailability {
  return { enabled: false, reason };
}

function available(reason: string): ConversationTurnActionAvailability {
  return { enabled: true, reason };
}

function getMessageProviderId(message: ChatMessage): ProviderId | null {
  return message.providerId === "claude-code" || message.providerId === "codex"
    ? message.providerId
    : null;
}

/**
 * Builds all row states in one reverse pass. ChatPanel calls this outside its
 * Zustand selector so streaming updates never create selector-owned Maps or
 * turn an O(n) list render into O(n²) per-message scans.
 */
export function buildConversationTurnActionStateByMessageId(args: {
  messages: ChatMessage[];
  providerSession?: TaskProviderSessionState;
  hasActiveTurn: boolean;
}): Map<string, ConversationTurnActionState> {
  const stateByMessageId = new Map<string, ConversationTurnActionState>();
  const laterTurnIdsBySession = new Map<string, Set<string>>();

  for (let index = args.messages.length - 1; index >= 0; index -= 1) {
    const message = args.messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }

    const providerId = getMessageProviderId(message);
    if (!providerId) {
      continue;
    }

    const capabilities = getProviderThreadActionCapabilities({ providerId });
    const sessionCursor = getProviderSessionCursor({
      sessions: args.providerSession,
      providerId,
    });
    const nativeSessionId =
      message.nativeProviderSessionId ?? sessionCursor?.nativeSessionId;
    const nativeTurnId = message.nativeProviderTurnId?.trim();
    const laterMessageCount = args.messages.length - index - 1;
    const sessionKey = nativeSessionId
      ? `${providerId}:${nativeSessionId}`
      : null;
    const laterTurnIds = sessionKey
      ? (laterTurnIdsBySession.get(sessionKey) ?? new Set<string>())
      : new Set<string>();

    let commonReason: string | null = null;
    if (args.hasActiveTurn) {
      commonReason = "Wait for the current response to finish.";
    } else if (message.isStreaming) {
      commonReason = "This response is still streaming.";
    } else if (!sessionCursor) {
      commonReason = `No ${providerId === "codex" ? "Codex thread" : "Claude session"} is linked to this task.`;
    } else if (
      message.nativeProviderSessionId &&
      message.nativeProviderSessionId !== sessionCursor.nativeSessionId
    ) {
      commonReason =
        "This response belongs to an earlier native session and cannot be changed from the current task.";
    } else if (!nativeTurnId) {
      commonReason =
        "This response predates native turn tracking. Point-in-time actions are available on newer responses.";
    }

    const fork = !capabilities.forkFromTurn.supported
      ? unavailable(capabilities.forkFromTurn.reason)
      : commonReason
        ? unavailable(commonReason)
        : available(
            "Fork a new task from this response. Workspace files stay as they are.",
          );

    let rollback: ConversationTurnActionAvailability;
    if (!capabilities.rollbackToTurn.supported) {
      rollback = unavailable(capabilities.rollbackToTurn.reason);
    } else if (commonReason) {
      rollback = unavailable(commonReason);
    } else if (laterMessageCount === 0) {
      rollback = unavailable(
        "This response is already the latest conversation point.",
      );
    } else {
      rollback = {
        enabled: true,
        reason:
          laterTurnIds.size > 0
            ? `Roll back ${laterTurnIds.size} later Codex turn${laterTurnIds.size === 1 ? "" : "s"} and remove all later task messages. Workspace files are not reverted.`
            : "Remove the later task messages and return to this Codex response. Workspace files are not reverted.",
        rollbackTurnCount: laterTurnIds.size,
      };
    }

    stateByMessageId.set(message.id, { fork, rollback });

    if (sessionKey && nativeTurnId) {
      laterTurnIds.add(nativeTurnId);
      laterTurnIdsBySession.set(sessionKey, laterTurnIds);
    }
  }

  return stateByMessageId;
}
