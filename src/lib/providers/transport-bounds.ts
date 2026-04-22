import type {
  CanonicalConversationMessage,
  CanonicalConversationRequest,
  ProviderId,
  ProviderTurnRequest,
} from "@/lib/providers/provider.types";
import type { MessagePart } from "@/types/chat";

const encoder = new TextEncoder();
type CanonicalContextPart = CanonicalConversationRequest["contextParts"][number];

export const HOST_SERVICE_PROVIDER_REQUEST_SOFT_MAX_BYTES = 900 * 1024;
export const HOST_SERVICE_PROVIDER_REQUEST_RETRY_MAX_BYTES = 256 * 1024;

function utf8ByteLength(value: string) {
  return encoder.encode(value).length;
}

function takeUtf8PrefixByBytes(args: { value: string; maxBytes: number }) {
  if (args.maxBytes <= 0 || args.value.length === 0) {
    return "";
  }
  if (utf8ByteLength(args.value) <= args.maxBytes) {
    return args.value;
  }

  let low = 0;
  let high = args.value.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = args.value.slice(0, mid);
    if (utf8ByteLength(candidate) <= args.maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return args.value.slice(0, best);
}

function takeUtf8SuffixByBytes(args: { value: string; maxBytes: number }) {
  if (args.maxBytes <= 0 || args.value.length === 0) {
    return "";
  }
  if (utf8ByteLength(args.value) <= args.maxBytes) {
    return args.value;
  }

  let low = 0;
  let high = args.value.length;
  let best = args.value.length;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = args.value.slice(mid);
    if (utf8ByteLength(candidate) <= args.maxBytes) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return args.value.slice(best);
}

function truncateUtf8Middle(args: {
  value: string;
  maxBytes: number;
  marker?: string;
}) {
  if (args.maxBytes <= 0) {
    return "";
  }
  if (utf8ByteLength(args.value) <= args.maxBytes) {
    return args.value;
  }

  const marker = args.marker ?? "\n…<truncated>…\n";
  const markerBytes = utf8ByteLength(marker);
  if (markerBytes >= args.maxBytes) {
    return takeUtf8PrefixByBytes({ value: marker, maxBytes: args.maxBytes });
  }

  const remaining = args.maxBytes - markerBytes;
  const prefixBudget = Math.ceil(remaining * 0.6);
  const suffixBudget = remaining - prefixBudget;
  const prefix = takeUtf8PrefixByBytes({
    value: args.value,
    maxBytes: prefixBudget,
  });
  const suffix = takeUtf8SuffixByBytes({
    value: args.value,
    maxBytes: suffixBudget,
  });
  return `${prefix}${marker}${suffix}`;
}

function summarizeMessagePart(part: MessagePart) {
  switch (part.type) {
    case "text":
      return part.text;
    case "thinking":
      return `[thinking] ${part.text}`;
    case "tool_use":
      return `[tool:${part.toolName}] input=${part.input}${part.output ? ` output=${part.output}` : ""}`;
    case "code_diff":
      return `[diff:${part.filePath}] status=${part.status}`;
    case "file_context":
      return `[file_context:${part.filePath}] ${part.instruction ?? ""}`.trim();
    case "image_context":
      return `[image:${part.label}]`;
    case "approval":
      return `[approval:${part.toolName}] ${part.description}`;
    case "user_input":
      return `[user_input:${part.toolName}] ${part.questions.length} questions`;
    case "system_event":
      return `[system] ${part.content}`;
    case "orchestration_progress":
      return `[orchestration:${part.status}] ${part.subtasks.length} subtasks`;
    case "stave_processing":
      return `[stave:${part.strategy}] ${part.reason}`;
  }
}

function summarizeHistoryMessage(message: CanonicalConversationMessage) {
  const primary = message.content.trim();
  if (primary.length > 0) {
    return primary;
  }
  if (message.isPlanResponse && message.planText?.trim()) {
    return message.planText.trim();
  }
  return message.parts.map((part) => summarizeMessagePart(part)).join(" | ").trim();
}

function compactHistoryMessage(args: {
  message: CanonicalConversationMessage;
  maxContentBytes: number;
}) {
  const summary = truncateUtf8Middle({
    value: summarizeHistoryMessage(args.message),
    maxBytes: args.maxContentBytes,
    marker: "\n…<history truncated>…\n",
  });
  return {
    ...args.message,
    content: summary,
    planText: args.message.planText
      ? truncateUtf8Middle({
          value: args.message.planText,
          maxBytes: args.maxContentBytes,
          marker: "\n…<plan truncated>…\n",
        })
      : args.message.planText,
    parts: summary.length > 0 ? [{ type: "text", text: summary } as const] : [],
  } satisfies CanonicalConversationMessage;
}

function compactHistoryTail(args: {
  history: CanonicalConversationMessage[];
  maxTotalBytes: number;
  maxPerMessageBytes: number;
  maxMessages: number;
}) {
  const compacted = args.history.map((message) => compactHistoryMessage({
    message,
    maxContentBytes: args.maxPerMessageBytes,
  }));

  const kept: CanonicalConversationMessage[] = [];
  let totalBytes = 0;
  for (let index = compacted.length - 1; index >= 0; index -= 1) {
    const message = compacted[index];
    if (!message) {
      continue;
    }
    const line = `${message.role}: ${message.content}`;
    const lineBytes = utf8ByteLength(line) + 1;
    if (
      kept.length > 0
      && (kept.length >= args.maxMessages || totalBytes + lineBytes > args.maxTotalBytes)
    ) {
      break;
    }
    kept.unshift(message);
    totalBytes += lineBytes;
  }

  return kept;
}

function compactConversationPrimary(
  conversation: CanonicalConversationRequest,
): CanonicalConversationRequest {
  return {
    ...conversation,
    history: compactHistoryTail({
      history: conversation.history,
      maxTotalBytes: 18 * 1024,
      maxPerMessageBytes: 8 * 1024,
      maxMessages: 24,
    }),
    input: {
      ...conversation.input,
      content: truncateUtf8Middle({
        value: conversation.input.content,
        maxBytes: 24 * 1024,
        marker: "\n…<input truncated>…\n",
      }),
      parts: conversation.input.content.trim().length > 0
        ? [{
            type: "text",
            text: truncateUtf8Middle({
              value: conversation.input.content,
              maxBytes: 24 * 1024,
              marker: "\n…<input truncated>…\n",
            }),
          }]
        : [],
    },
    contextParts: conversation.contextParts.map((part) => compactContextPart({
      part,
      mode: "primary",
    })),
  };
}

function compactConversationAggressively(
  conversation: CanonicalConversationRequest,
): CanonicalConversationRequest {
  return {
    ...conversation,
    history: compactHistoryTail({
      history: conversation.history,
      maxTotalBytes: 8 * 1024,
      maxPerMessageBytes: 3 * 1024,
      maxMessages: 8,
    }),
    input: {
      ...conversation.input,
      content: truncateUtf8Middle({
        value: conversation.input.content,
        maxBytes: 12 * 1024,
        marker: "\n…<input truncated>…\n",
      }),
      parts: conversation.input.content.trim().length > 0
        ? [{
            type: "text",
            text: truncateUtf8Middle({
              value: conversation.input.content,
              maxBytes: 12 * 1024,
              marker: "\n…<input truncated>…\n",
            }),
          }]
        : [],
    },
    contextParts: conversation.contextParts.map((part) => compactContextPart({
      part,
      mode: "aggressive",
    })),
  };
}

function buildMinimalConversation(
  conversation: CanonicalConversationRequest,
): CanonicalConversationRequest {
  return {
    ...conversation,
    history: compactHistoryTail({
      history: conversation.history,
      maxTotalBytes: 4 * 1024,
      maxPerMessageBytes: 2 * 1024,
      maxMessages: 2,
    }),
    input: {
      ...conversation.input,
      content: truncateUtf8Middle({
        value: conversation.input.content,
        maxBytes: 8 * 1024,
        marker: "\n…<input truncated>…\n",
      }),
      parts: conversation.input.content.trim().length > 0
        ? [{
            type: "text",
            text: truncateUtf8Middle({
              value: conversation.input.content,
              maxBytes: 8 * 1024,
              marker: "\n…<input truncated>…\n",
            }),
          }]
        : [],
    },
    contextParts: [],
  };
}

function measureProviderTurnRequestEnvelopeBytes(args: {
  method: "provider.stream-turn" | "provider.start-stream-turn" | "provider.start-push-turn";
  request: ProviderTurnRequest;
}) {
  return utf8ByteLength(JSON.stringify({
    type: "request",
    id: 1,
    method: args.method,
    params: args.request,
  })) + 1;
}

function getRetrievedContextMaxBytes(args: {
  sourceId: string;
  mode: "primary" | "aggressive";
}) {
  const isAggressive = args.mode === "aggressive";
  switch (args.sourceId) {
    case "stave:current-task-awareness":
      return isAggressive ? 12 * 1024 : 40 * 1024;
    case "stave:referenced-task-replies":
      return isAggressive ? 8 * 1024 : 20 * 1024;
    case "stave:repo-map":
      return isAggressive ? 2 * 1024 : 10 * 1024;
    default:
      return isAggressive ? 4 * 1024 : 12 * 1024;
  }
}

function getContextDropPriority(part: CanonicalContextPart) {
  if (part.type === "retrieved_context") {
    switch (part.sourceId) {
      case "stave:repo-map":
        return 0;
      case "stave:muse-context":
      case "stave:muse-planner-prompt":
      case "stave:muse-chat-prompt":
        return 1;
      case "stave:referenced-task-replies":
        return 4;
      case "stave:current-task-awareness":
        return 6;
      default:
        return 2;
    }
  }
  switch (part.type) {
    case "image_context":
      return 1;
    case "skill_context":
      return 3;
    case "file_context":
      return 7;
  }
}

function compactContextPart(args: {
  part: CanonicalContextPart;
  mode: "primary" | "aggressive";
}): CanonicalContextPart {
  switch (args.part.type) {
    case "file_context":
      return {
        ...args.part,
        instruction: args.part.instruction
          ? truncateUtf8Middle({
              value: args.part.instruction,
              maxBytes: args.mode === "aggressive" ? 1024 : 2 * 1024,
              marker: args.mode === "aggressive" ? "…" : "\n…<instruction truncated>…\n",
            })
          : args.part.instruction,
        content: truncateUtf8Middle({
          value: args.part.content,
          maxBytes: args.mode === "aggressive" ? 24 * 1024 : 96 * 1024,
          marker: "\n…<file context truncated for transport>…\n",
        }),
      };
    case "retrieved_context":
      return {
        ...args.part,
        title: args.part.title
          ? truncateUtf8Middle({
              value: args.part.title,
              maxBytes: args.mode === "aggressive" ? 256 : 1024,
              marker: "…",
            })
          : args.part.title,
        content: truncateUtf8Middle({
          value: args.part.content,
          maxBytes: getRetrievedContextMaxBytes({
            sourceId: args.part.sourceId,
            mode: args.mode,
          }),
          marker: "\n…<retrieved context truncated for transport>…\n",
        }),
      };
    case "image_context":
      return {
        ...args.part,
        dataUrl: "",
      };
    case "skill_context":
      return {
        ...args.part,
        skills: args.part.skills
          .slice(0, args.mode === "aggressive" ? 4 : args.part.skills.length)
          .map((skill) => ({
            ...skill,
            instructions: truncateUtf8Middle({
              value: skill.instructions,
              maxBytes: args.mode === "aggressive" ? 8 * 1024 : 24 * 1024,
              marker: "\n…<skill instructions truncated>…\n",
            }),
          })),
      };
  }
}

function dropLowPriorityContextPartsToFit(args: {
  method: "provider.stream-turn" | "provider.start-stream-turn" | "provider.start-push-turn";
  request: ProviderTurnRequest & { providerId: ProviderId };
  maxBytes: number;
}) {
  const conversation = args.request.conversation;
  if (!conversation || conversation.contextParts.length === 0) {
    return args.request;
  }

  const dropOrder = conversation.contextParts
    .map((part, index) => ({
      index,
      priority: getContextDropPriority(part),
      size: utf8ByteLength(JSON.stringify(part)),
    }))
    .sort((left, right) => (
      left.priority === right.priority
        ? right.size - left.size
        : left.priority - right.priority
    ));

  const droppedIndexes = new Set<number>();
  let nextRequest = args.request;
  for (const candidate of dropOrder) {
    if (measureProviderTurnRequestEnvelopeBytes({
      method: args.method,
      request: nextRequest,
    }) <= args.maxBytes) {
      break;
    }
    droppedIndexes.add(candidate.index);
    nextRequest = {
      ...nextRequest,
      conversation: {
        ...conversation,
        contextParts: conversation.contextParts.filter((_, index) => !droppedIndexes.has(index)),
      },
    };
  }

  return nextRequest;
}

export function compactProviderTurnRequestForTransport(args: {
  method: "provider.stream-turn" | "provider.start-stream-turn" | "provider.start-push-turn";
  request: ProviderTurnRequest & { providerId: ProviderId };
  maxBytes?: number;
}) {
  const maxBytes = args.maxBytes ?? HOST_SERVICE_PROVIDER_REQUEST_SOFT_MAX_BYTES;
  let nextRequest: ProviderTurnRequest & { providerId: ProviderId } = args.request;

  if (measureProviderTurnRequestEnvelopeBytes({
    method: args.method,
    request: nextRequest,
  }) <= maxBytes) {
    return nextRequest;
  }

  if (nextRequest.conversation) {
    nextRequest = {
      ...nextRequest,
      conversation: compactConversationPrimary(nextRequest.conversation),
    };
  }

  if (measureProviderTurnRequestEnvelopeBytes({
    method: args.method,
    request: nextRequest,
  }) <= maxBytes) {
    return nextRequest;
  }

  if (nextRequest.conversation) {
    nextRequest = {
      ...nextRequest,
      conversation: compactConversationAggressively(nextRequest.conversation),
    };
  }

  nextRequest = dropLowPriorityContextPartsToFit({
    method: args.method,
    request: nextRequest,
    maxBytes,
  });

  if (measureProviderTurnRequestEnvelopeBytes({
    method: args.method,
    request: nextRequest,
  }) <= maxBytes) {
    return nextRequest;
  }

  if (nextRequest.conversation) {
    nextRequest = {
      ...nextRequest,
      conversation: buildMinimalConversation(nextRequest.conversation),
    };
  }

  if (measureProviderTurnRequestEnvelopeBytes({
    method: args.method,
    request: nextRequest,
  }) <= maxBytes) {
    return nextRequest;
  }

  return {
    ...nextRequest,
    prompt: truncateUtf8Middle({
      value: nextRequest.prompt,
      maxBytes: 16 * 1024,
      marker: "\n…<prompt truncated for transport>…\n",
    }),
    conversation: nextRequest.conversation
      ? buildMinimalConversation(nextRequest.conversation)
      : nextRequest.conversation,
  };
}
