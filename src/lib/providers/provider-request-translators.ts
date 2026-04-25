import { buildLegacyPromptFromCanonicalRequest } from "./canonical-request";
import type { CanonicalConversationRequest, ProviderId } from "./provider.types";

function getStoredResumeSessionId(conversation?: CanonicalConversationRequest) {
  const value = conversation?.resume?.nativeSessionId?.trim();
  return value ? value : undefined;
}

function shouldIncludeHistory(conversation: CanonicalConversationRequest) {
  return !getStoredResumeSessionId(conversation);
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
}) {
  // Include full activated skill instructions in the prompt body for both
  // providers. Stave-managed `$skill` activations are prompt-context based,
  // not native slash-skill registrations.
  return buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
    includeSkillContext: true,
  }) || args.fallbackPrompt;
}

export function buildCodexPromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
}) {
  return buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
    includeSkillContext: true,
  }) || args.fallbackPrompt;
}

export function buildProviderTurnPrompt(args: {
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
}) {
  if (!args.conversation) {
    return args.prompt;
  }

  if (args.providerId === "claude-code") {
    return buildClaudePromptFromConversation({
      conversation: args.conversation,
      fallbackPrompt: args.prompt,
    });
  }

  return buildCodexPromptFromConversation({
    conversation: args.conversation,
    fallbackPrompt: args.prompt,
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
