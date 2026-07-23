import { buildLegacyPromptFromCanonicalRequest } from "./canonical-request";
import type { CanonicalConversationRequest, ProviderId } from "./provider.types";

function getStoredResumeSessionId(conversation?: CanonicalConversationRequest) {
  const value = conversation?.resume?.nativeSessionId?.trim();
  return value ? value : undefined;
}

function resolveActiveResumeSessionId(args: {
  conversation: CanonicalConversationRequest;
  activeResumeSessionId?: string | null;
}) {
  return args.activeResumeSessionId === undefined
    ? getStoredResumeSessionId(args.conversation)
    : args.activeResumeSessionId?.trim() || undefined;
}

export function selectHistoryForProviderPrompt(args: {
  conversation: CanonicalConversationRequest;
  activeResumeSessionId?: string | null;
}) {
  const storedResumeSessionId = getStoredResumeSessionId(args.conversation);
  const activeResumeSessionId = resolveActiveResumeSessionId(args);

  // The runtime is starting a fresh native session. It must receive all
  // available history even when the renderer supplied a now-stale resume id.
  if (!activeResumeSessionId) {
    return args.conversation.history;
  }

  // A runtime-local session that differs from the renderer snapshot is already
  // authoritative for this task. Without a matching cursor, preserve the
  // legacy resume behavior and avoid replaying duplicate history.
  if (activeResumeSessionId !== storedResumeSessionId) {
    return [];
  }

  const cursor = args.conversation.resume?.syncedThroughMessageId?.trim();
  if (!cursor) {
    return [];
  }

  const cursorIndex = args.conversation.history.findIndex(
    (message) => message.messageId === cursor,
  );
  return cursorIndex === -1
    ? args.conversation.history
    : args.conversation.history.slice(cursorIndex + 1);
}

const PROVIDER_NATIVE_SLASH_COMMAND_PATTERN = /^\/[A-Za-z0-9:._-]+(?:\s|$)/;

export function getProviderNativeSlashCommandInput(
  conversation: CanonicalConversationRequest,
) {
  const input = conversation.input.content.trimStart();
  return PROVIDER_NATIVE_SLASH_COMMAND_PATTERN.test(input) ? input : null;
}

export function filterPromptRetrievedContext(args: {
  conversation: CanonicalConversationRequest;
  excludedSourceIds?: string[];
}) {
  const excludedSourceIds = new Set((args.excludedSourceIds ?? []).filter(Boolean));
  if (excludedSourceIds.size === 0) {
    return args.conversation;
  }

  const nextContextParts = args.conversation.contextParts.filter((part) => (
    part.type !== "retrieved_context" || !excludedSourceIds.has(part.sourceId)
  ));
  return nextContextParts.length === args.conversation.contextParts.length
    ? args.conversation
    : {
        ...args.conversation,
        contextParts: nextContextParts,
      };
}

export function buildClaudePromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
  activeResumeSessionId?: string | null;
}) {
  const slashCommandInput = getProviderNativeSlashCommandInput(
    args.conversation,
  );
  if (slashCommandInput) {
    return slashCommandInput;
  }

  // Include full activated skill instructions in the prompt body for both
  // providers. Stave-managed `$skill` activations are prompt-context based,
  // not native slash-skill registrations.
  const selectedHistory = selectHistoryForProviderPrompt({
    conversation: args.conversation,
    activeResumeSessionId: args.activeResumeSessionId,
  });
  const activeResumeSessionId = resolveActiveResumeSessionId(args);
  return buildLegacyPromptFromCanonicalRequest({
    request: {
      ...args.conversation,
      history: selectedHistory,
    },
    includeHistory: !activeResumeSessionId || selectedHistory.length > 0,
    includeSkillContext: true,
  }) || args.fallbackPrompt;
}

export function buildCodexPromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
  activeResumeSessionId?: string | null;
}) {
  const slashCommandInput = getProviderNativeSlashCommandInput(
    args.conversation,
  );
  if (slashCommandInput) {
    return slashCommandInput;
  }

  const selectedHistory = selectHistoryForProviderPrompt({
    conversation: args.conversation,
    activeResumeSessionId: args.activeResumeSessionId,
  });
  const activeResumeSessionId = resolveActiveResumeSessionId(args);
  return buildLegacyPromptFromCanonicalRequest({
    request: {
      ...args.conversation,
      history: selectedHistory,
    },
    includeHistory: !activeResumeSessionId || selectedHistory.length > 0,
    includeSkillContext: true,
  }) || args.fallbackPrompt;
}

export function buildProviderTurnPrompt(args: {
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  activeResumeSessionId?: string | null;
}) {
  if (!args.conversation) {
    return args.prompt;
  }

  if (args.providerId === "claude-code") {
    return buildClaudePromptFromConversation({
      conversation: args.conversation,
      fallbackPrompt: args.prompt,
      activeResumeSessionId: args.activeResumeSessionId,
    });
  }

  return buildCodexPromptFromConversation({
    conversation: args.conversation,
    fallbackPrompt: args.prompt,
    activeResumeSessionId: args.activeResumeSessionId,
  });
}

export function resolveProviderResumeSessionId(args: {
  conversation?: CanonicalConversationRequest;
  fallbackResumeId?: string;
}) {
  const fallback = args.fallbackResumeId?.trim();
  if (fallback) {
    return fallback;
  }
  return getStoredResumeSessionId(args.conversation);
}
