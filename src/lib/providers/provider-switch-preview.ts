import type { ChatMessage } from "@/types/chat";
import { BOUNDED_HISTORY_MAX_CHARS, planBoundedHistory } from "./bounded-history";
import { buildCanonicalConversationRequest, canonicalHistoryText } from "./canonical-request";
import type { ProviderSessionCursor } from "@/lib/db/workspaces.db";
import type { ProviderId } from "./provider.types";
import {
  getProviderNativeSlashCommandInput,
  selectHistoryForProviderPrompt,
} from "./provider-request-translators";

/**
 * What the next message's provider receives when it is not the provider that
 * answered last. Each provider keeps its own session per task: one new to the
 * task starts fresh and gets a bounded excerpt of the conversation, one that
 * worked here before resumes its session and gets what happened since. Both
 * are computed by the functions that build the real prompt, so the composer's
 * notice and the request cannot disagree.
 */
export interface ProviderSwitchPreview {
  fromProviderId: ProviderId;
  toProviderId: ProviderId;
  /** `fresh`: a new session for this task; `resume`: its own earlier session. */
  session: "fresh" | "resume";
  /** Messages the excerpt was built from (all loaded, or those since the session's last sync). */
  totalMessages: number;
  keptMessages: number;
  shortenedMessages: number;
  omittedMessages: number;
  /** Characters of the excerpt. */
  chars: number;
  maxChars: number;
  overflowed: boolean;
  /**
   * Kept messages without text: they travel as a summary of their parts (tool
   * calls with input and output, images and files by name) instead of text.
   */
  summarizedMessages?: number;
  /**
   * The provider command the draft starts with (`/compact`), when it is one:
   * it goes as typed, with no excerpt and no handoff record.
   */
  command?: string;
}

/** The provider of the task's latest reply, or null before any reply. */
export function resolveLatestReplyProvider(messages: readonly ChatMessage[]): ProviderId | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.providerId !== "user") {
      return message.providerId;
    }
  }
  return null;
}

export function buildProviderSwitchPreview(args: {
  messages: readonly ChatMessage[];
  toProviderId: ProviderId;
  /** The next message's provider session for this task and account, if it has one. */
  resume: ProviderSessionCursor | null;
  /** The draft as it would be sent; a provider command takes the translators' command branch. */
  userInput?: string;
}): ProviderSwitchPreview | null {
  const fromProviderId = resolveLatestReplyProvider(args.messages);
  if (!fromProviderId || fromProviderId === args.toProviderId) {
    return null;
  }
  const conversation = buildCanonicalConversationRequest({
    turnId: "provider-switch-preview",
    taskId: "",
    workspaceId: "",
    providerId: args.toProviderId,
    history: [...args.messages],
    userInput: args.userInput ?? "",
    nativeSessionId: args.resume?.nativeSessionId ?? null,
    syncedThroughMessageId: args.resume?.syncedThroughMessageId ?? null,
  });
  const session = conversation.resume ? "resume" : "fresh";
  // The same branch the translators take: a provider command is sent alone.
  const command = getProviderNativeSlashCommandInput(conversation);
  if (command) {
    return {
      fromProviderId,
      toProviderId: args.toProviderId,
      session,
      totalMessages: 0,
      keptMessages: 0,
      shortenedMessages: 0,
      omittedMessages: 0,
      chars: 0,
      maxChars: BOUNDED_HISTORY_MAX_CHARS,
      overflowed: false,
      command: command.split(/\s/, 1)[0] ?? command,
    };
  }
  const selected = selectHistoryForProviderPrompt({ conversation });
  const plan = planBoundedHistory({
    messages: selected.map((message) => ({ role: message.role, text: canonicalHistoryText(message) })),
  });
  // The replay uses a message's text; one without text is replaced by its parts, summarized.
  const summarizedMessages = plan.keptIndexes.filter((index) => {
    const message = selected[index];
    return message !== undefined && message.content.trim().length === 0 && canonicalHistoryText(message).length > 0;
  }).length;
  return {
    fromProviderId,
    toProviderId: args.toProviderId,
    session,
    totalMessages: plan.totalMessages,
    keptMessages: plan.keptMessages,
    shortenedMessages: plan.shortenedMessages,
    omittedMessages: plan.omittedMessages,
    chars: selected.length > 0 ? plan.text.length : 0,
    maxChars: plan.maxChars,
    overflowed: plan.overflowed,
    summarizedMessages,
  };
}
