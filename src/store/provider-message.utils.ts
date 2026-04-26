import type {
  ApprovalPart,
  ChatMessage,
  MessagePart,
  ToolUsePart,
  UserInputPart,
} from "@/types/chat";

type ToolResultEvent = {
  tool_use_id: string;
  output: string;
  isError?: boolean;
  isPartial?: boolean;
};

export function hasRenderableAssistantPart(part: MessagePart): boolean {
  if (part.type === "text") {
    return part.text.trim().length > 0;
  }
  if (part.type === "system_event") {
    return part.content.trim().length > 0;
  }
  if (part.type === "thinking") {
    return part.text.trim().length > 0;
  }
  return true;
}

export function hasRenderableAssistantContent(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isPlanResponse">;
}): boolean {
  return (
    args.message.content.trim().length > 0
    || args.message.parts.some(hasRenderableAssistantPart)
    || args.message.isPlanResponse === true
  );
}

export function mergePromptSuggestions(args: {
  existing?: string[];
  incoming: string[];
}): string[] {
  const merged = [...(args.existing ?? [])];

  for (const suggestion of args.incoming) {
    if (!merged.includes(suggestion)) {
      merged.push(suggestion);
    }
  }

  return merged;
}

export function mergeToolResultIntoPart(args: {
  part: MessagePart;
  event: ToolResultEvent;
}): MessagePart {
  const { part, event } = args;

  if (part.type !== "tool_use" || part.toolUseId !== event.tool_use_id) {
    return part;
  }

  if (event.isError) {
    return {
      ...part,
      output: event.output,
      state: "output-error",
    };
  }

  const nextState: ToolUsePart["state"] = event.isPartial
    ? (part.state === "input-available" ? "input-streaming" : part.state)
    : "output-available";

  return {
    ...part,
    output: event.output,
    state: nextState,
  };
}

export function findLatestPendingApprovalPart(args: {
  message?: Pick<ChatMessage, "parts">;
}): ApprovalPart | undefined {
  const parts = args.message?.parts ?? [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === "approval" && part.state === "approval-requested") {
      return part;
    }
  }

  return undefined;
}

export function findLatestPendingToolInteractionPart(args: {
  message?: Pick<ChatMessage, "parts">;
}): ApprovalPart | UserInputPart | undefined {
  const parts = args.message?.parts ?? [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === "approval" && part.state === "approval-requested") {
      return part;
    }
    if (part?.type === "user_input" && part.state === "input-requested") {
      return part;
    }
  }

  return undefined;
}

export function findLatestPendingApproval(args: {
  messages: ChatMessage[];
}): { messageId: string; part: ApprovalPart } | null {
  const pendingApprovals = findPendingApprovals(args);
  return pendingApprovals[0] ?? null;
}

export function findPendingApprovals(args: {
  messages: ChatMessage[];
}): Array<{ messageId: string; part: ApprovalPart }> {
  const pendingApprovals: Array<{ messageId: string; part: ApprovalPart }> = [];

  for (let messageIndex = args.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = args.messages[messageIndex];
    if (!message) {
      continue;
    }

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part?.type === "approval" && part.state === "approval-requested") {
        pendingApprovals.push({
          messageId: message.id,
          part,
        });
      }
    }
  }

  return pendingApprovals;
}

export function findLatestPendingToolInteraction(args: {
  messages: ChatMessage[];
}): { messageId: string; part: ApprovalPart | UserInputPart } | null {
  for (let messageIndex = args.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = args.messages[messageIndex];
    if (!message) {
      continue;
    }

    const part = findLatestPendingToolInteractionPart({ message });
    if (part) {
      return {
        messageId: message.id,
        part,
      };
    }
  }

  return null;
}

export function findPendingApprovalMessageByRequestId(args: {
  messages: ChatMessage[];
  requestId: string;
}): { messageId: string; part: ApprovalPart } | null {
  for (let messageIndex = args.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = args.messages[messageIndex];
    if (!message) {
      continue;
    }
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (
        part?.type === "approval"
        && part.requestId === args.requestId
        && part.state === "approval-requested"
      ) {
        return {
          messageId: message.id,
          part,
        };
      }
    }
  }

  return null;
}

export function findLatestPendingUserInputPart(args: {
  message?: Pick<ChatMessage, "parts">;
}): UserInputPart | undefined {
  const parts = args.message?.parts ?? [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === "user_input" && part.state === "input-requested") {
      return part;
    }
  }

  return undefined;
}

export function findLatestPendingUserInput(args: {
  messages: ChatMessage[];
}): { messageId: string; part: UserInputPart } | null {
  for (let messageIndex = args.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = args.messages[messageIndex];
    if (!message) {
      continue;
    }

    const part = findLatestPendingUserInputPart({ message });
    if (part) {
      return {
        messageId: message.id,
        part,
      };
    }
  }

  return null;
}

export function updateApprovalPartsByRequestId(args: {
  parts: MessagePart[];
  requestId: string;
  approved: boolean;
}): MessagePart[] {
  return args.parts.map((part) => {
    if (part.type !== "approval" || part.requestId !== args.requestId) {
      return part;
    }

    return {
      ...part,
      state: args.approved ? "approval-responded" : "output-denied",
    };
  });
}

export function resolvePendingToolInteractionPartsByRequestId(args: {
  parts: MessagePart[];
  requestId?: string;
}): MessagePart[] {
  const requestId = args.requestId?.trim();
  if (!requestId) {
    return args.parts;
  }

  let changed = false;
  const nextParts = args.parts.map((part) => {
    if (part.type === "approval" && part.requestId === requestId && part.state === "approval-requested") {
      changed = true;
      return {
        ...part,
        state: "approval-responded" as const,
      };
    }

    if (part.type === "user_input" && part.requestId === requestId && part.state === "input-requested") {
      changed = true;
      return {
        ...part,
        state: "input-responded" as const,
      };
    }

    return part;
  });

  return changed ? nextParts : args.parts;
}

export function interruptPendingToolInteractionParts(args: {
  parts: MessagePart[];
}): MessagePart[] {
  let changed = false;
  const nextParts = args.parts.map((part) => {
    if (part.type === "approval" && part.state === "approval-requested") {
      changed = true;
      return {
        ...part,
        state: "approval-interrupted" as const,
      };
    }

    if (part.type === "user_input" && part.state === "input-requested") {
      changed = true;
      return {
        ...part,
        state: "input-interrupted" as const,
      };
    }

    return part;
  });

  return changed ? nextParts : args.parts;
}

export function interruptPendingToolInteractionsInMessages(args: {
  messages: ChatMessage[];
}): ChatMessage[] {
  let changed = false;
  const nextMessages = args.messages.map((message) => {
    const nextParts = interruptPendingToolInteractionParts({
      parts: message.parts,
    });
    if (nextParts === message.parts) {
      return message;
    }
    changed = true;
    return {
      ...message,
      parts: nextParts,
    };
  });

  return changed ? nextMessages : args.messages;
}

export function updateUserInputPartsByRequestId(args: {
  parts: MessagePart[];
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}): MessagePart[] {
  return args.parts.map((part) => {
    if (part.type !== "user_input" || part.requestId !== args.requestId) {
      return part;
    }

    return {
      ...part,
      answers: args.answers,
      state: args.denied ? "input-denied" : "input-responded",
    };
  });
}
