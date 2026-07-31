import { sanitizeFileContextPayload } from "@/lib/file-context-sanitization";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import { providerSupportsMidTurnSteering } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { getRespondingProviderId } from "@/lib/tasks";
import type {
  ChatMessage,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  Task,
  TextPart,
  TurnModelInfo,
} from "@/types/chat";

export function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

export function buildRecentTimestamp() {
  return new Date().toISOString();
}

export function resolveMidTurnSteeringContext(args: {
  activeTurnId: string;
  activity?: Pick<ProviderTurnActivitySnapshot, "turnId" | "providerId">;
  fallbackProviderId: ProviderId;
  messages: ChatMessage[];
  hasAttachments: boolean;
}) {
  const providerId =
    args.activity?.turnId === args.activeTurnId
      ? args.activity.providerId
      : getRespondingProviderId({
          fallbackProviderId: args.fallbackProviderId,
          messages: args.messages,
        });

  if (args.hasAttachments) {
    return {
      providerId,
      unavailableMessage:
        "Attachments can't be steered into a live turn — press Tab to queue instead.",
    };
  }
  if (!providerSupportsMidTurnSteering({ providerId })) {
    return {
      providerId,
      unavailableMessage: `${providerId} does not support mid-turn steering.`,
    };
  }
  return { providerId, unavailableMessage: null };
}

export function createUserTextPart(args: { text: string }): TextPart {
  return {
    type: "text",
    text: args.text,
  };
}

const LENS_VISUAL_COMMENTS_MARKER = "[Lens Visual Comments]";

function stripLensVisualCommentsFromDisplayText(text: string): string {
  const markerIndex = text.indexOf(LENS_VISUAL_COMMENTS_MARKER);
  if (markerIndex === -1) {
    return text;
  }
  return text.slice(0, markerIndex).trimEnd();
}

function sanitizeDisplayParts(parts: MessagePart[]): MessagePart[] {
  const sanitizedParts: MessagePart[] = [];
  for (const part of parts) {
    if (part.type !== "text") {
      sanitizedParts.push(part);
      continue;
    }
    const text = stripLensVisualCommentsFromDisplayText(part.text);
    if (text.trim()) {
      sanitizedParts.push({ ...part, text });
    }
  }
  return sanitizedParts;
}

export function createFileContextPart(args: {
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}): FileContextPart {
  return sanitizeFileContextPayload({
    type: "file_context",
    filePath: args.filePath,
    content: args.content,
    language: args.language,
    instruction: args.instruction,
  });
}

export function buildLocalCommandResponseState(args: {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  nativeSessionReadyByTask: Record<string, boolean>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceSnapshotVersion: number;
  taskId: string;
  taskWorkspaceId: string;
  provider: ProviderId;
  activeModel: string;
  content: string;
  responseText: string;
  shouldClearProviderSession: boolean;
}) {
  const current = args.messagesByTask[args.taskId] ?? [];
  // Message IDs are positional over the FULL history; `current` may be a trimmed
  // tail window, so anchor new IDs to the durable total (`messageCountByTask`) to
  // avoid colliding with unloaded older rows on the additive-upsert persist path.
  const baseMessageCount = Math.max(
    current.length,
    args.messageCountByTask[args.taskId] ?? 0,
  );
  const userMessageId = buildMessageId({ taskId: args.taskId, count: baseMessageCount });
  const assistantMessageId = buildMessageId({ taskId: args.taskId, count: baseMessageCount + 1 });
  const timestamp = buildRecentTimestamp();

  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    parts: [createUserTextPart({ text: args.content })],
  };

  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    model: args.activeModel,
    providerId: args.provider,
    content: args.responseText,
    startedAt: timestamp,
    completedAt: timestamp,
    isStreaming: false,
    parts: args.responseText ? [createUserTextPart({ text: args.responseText })] : [],
  };
  const nextMessages = args.shouldClearProviderSession
    ? [userMessage, assistantMessage]
    : [...current, userMessage, assistantMessage];

  return {
    tasks: args.tasks.map((taskItem) =>
      taskItem.id === args.taskId
        ? { ...taskItem, archivedAt: null, updatedAt: buildRecentTimestamp() }
        : taskItem
    ),
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: nextMessages,
    },
    messageCountByTask: {
      ...args.messageCountByTask,
      [args.taskId]: Math.max(
        nextMessages.length,
        (args.messageCountByTask[args.taskId] ?? current.length) + (nextMessages.length - current.length),
      ),
    },
    activeTurnIdsByTask: {
      ...args.activeTurnIdsByTask,
      [args.taskId]: undefined,
    },
    nativeSessionReadyByTask: args.shouldClearProviderSession
      ? {
          ...args.nativeSessionReadyByTask,
          [args.taskId]: false,
        }
      : args.nativeSessionReadyByTask,
    providerSessionByTask: args.shouldClearProviderSession
      ? Object.fromEntries(
          Object.entries(args.providerSessionByTask).filter(([key]) => key !== args.taskId)
        )
      : args.providerSessionByTask,
    taskWorkspaceIdById: {
      ...args.taskWorkspaceIdById,
      [args.taskId]: args.taskWorkspaceId,
    },
    workspaceSnapshotVersion: args.workspaceSnapshotVersion + 1,
  };
}

export function buildPendingProviderTurnState(args: {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceSnapshotVersion: number;
  taskId: string;
  taskWorkspaceId: string;
  turnId: string;
  provider: ProviderId;
  activeModel: string;
  modelInfo?: TurnModelInfo;
  content: string;
  displayContent?: string;
  displayParts?: MessagePart[];
  fileContexts?: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>;
  imageContexts?: Array<{
    dataUrl: string;
    label: string;
    mimeType: string;
  }>;
}) {
  const current = args.messagesByTask[args.taskId] ?? [];
  // Anchor new IDs to the durable total; `current` may be a trimmed tail window.
  const baseMessageCount = Math.max(
    current.length,
    args.messageCountByTask[args.taskId] ?? 0,
  );
  const userMessageId = buildMessageId({ taskId: args.taskId, count: baseMessageCount });
  const assistantMessageId = buildMessageId({ taskId: args.taskId, count: baseMessageCount + 1 });
  const userParts: MessagePart[] = [];

  if (args.fileContexts) {
    for (const fileContext of args.fileContexts) {
      userParts.push(createFileContextPart({
        filePath: fileContext.filePath,
        content: fileContext.content,
        language: fileContext.language,
        instruction: fileContext.instruction,
      }));
    }
  }

  if (args.imageContexts) {
    for (const imageContext of args.imageContexts) {
      userParts.push({
        type: "image_context",
        dataUrl: imageContext.dataUrl,
        label: imageContext.label,
        mimeType: imageContext.mimeType,
      } satisfies ImageContextPart);
    }
  }

  if (args.content.trim().length > 0) {
    userParts.push(createUserTextPart({ text: args.content }));
  }

  const displayContent = args.displayContent
    ? stripLensVisualCommentsFromDisplayText(args.displayContent)
    : undefined;
  let displayParts: MessagePart[] | undefined;
  if (args.displayParts) {
    displayParts = sanitizeDisplayParts(args.displayParts);
  } else if (displayContent) {
    displayParts = [];
    for (const part of userParts) {
      if (part.type === "text") {
        if (displayContent.trim()) {
          displayParts.push(createUserTextPart({ text: displayContent }));
        }
        continue;
      }
      displayParts.push(part);
    }
  }

  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    ...(displayContent ? { displayContent } : {}),
    parts: userParts.length > 0 ? userParts : [createUserTextPart({ text: args.content })],
    ...(displayParts && displayParts.length > 0 ? { displayParts } : {}),
  };

  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    model: args.activeModel,
    providerId: args.provider,
    ...(args.modelInfo ? { modelInfo: args.modelInfo } : {}),
    content: "",
    startedAt: buildRecentTimestamp(),
    isStreaming: true,
    parts: [],
  };
  const nextMessages = [...current, userMessage, assistantMessage];

  return {
    tasks: args.tasks.map((taskItem) =>
      taskItem.id === args.taskId
        ? {
            ...taskItem,
            archivedAt: null,
            updatedAt: buildRecentTimestamp(),
          }
        : taskItem
    ),
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: nextMessages,
    },
    messageCountByTask: {
      ...args.messageCountByTask,
      [args.taskId]: Math.max(
        nextMessages.length,
        (args.messageCountByTask[args.taskId] ?? current.length) + (nextMessages.length - current.length),
      ),
    },
    activeTurnIdsByTask: {
      ...args.activeTurnIdsByTask,
      [args.taskId]: args.turnId,
    },
    taskWorkspaceIdById: {
      ...args.taskWorkspaceIdById,
      [args.taskId]: args.taskWorkspaceId,
    },
    workspaceSnapshotVersion: args.workspaceSnapshotVersion + 1,
  };
}

/**
 * Build the message-list mutation for a follow-up that was *steered* into an
 * already-running turn (mid-turn injection). When the target turn is still
 * active, close the pre-steer assistant segment and create a fresh streaming
 * assistant placeholder after the steered user message. This keeps the live
 * assistant as the final message so subsequent provider events cannot make
 * the steer look like a separate turn.
 */
export function buildSteeredUserMessageState(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  taskId: string;
  content: string;
  steeredIntoTurnId: string;
  clientMessageId: string;
  provider: ProviderId;
  activeModel: string;
  turnStillActive: boolean;
}) {
  const current = args.messagesByTask[args.taskId] ?? [];
  const baseMessageCount = Math.max(
    current.length,
    args.messageCountByTask[args.taskId] ?? 0,
  );
  const timestamp = buildRecentTimestamp();
  const latestMessage = current.at(-1);
  const segmentedCurrent =
    args.turnStillActive &&
    latestMessage?.role === "assistant" &&
    latestMessage.isStreaming
      ? [
          ...current.slice(0, -1),
          {
            ...latestMessage,
            isStreaming: false,
            completedAt: latestMessage.completedAt ?? timestamp,
          },
        ]
      : current;

  const userMessage: ChatMessage = {
    id: args.clientMessageId,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    parts: [createUserTextPart({ text: args.content })],
    steeredIntoTurnId: args.steeredIntoTurnId,
    steerDeliveryState: "accepted",
  };
  const assistantMessage: ChatMessage | null = args.turnStillActive
    ? {
        id: buildMessageId({
          taskId: args.taskId,
          count: baseMessageCount + 1,
        }),
        role: "assistant",
        model:
          latestMessage?.role === "assistant"
            ? latestMessage.model
            : args.activeModel,
        providerId:
          latestMessage?.role === "assistant" &&
          latestMessage.providerId !== "user"
            ? latestMessage.providerId
            : args.provider,
        ...(latestMessage?.role === "assistant" && latestMessage.modelInfo
          ? { modelInfo: latestMessage.modelInfo }
          : {}),
        content: "",
        startedAt: timestamp,
        isStreaming: true,
        parts: [],
      }
    : null;
  const appendedMessages = assistantMessage
    ? [userMessage, assistantMessage]
    : [userMessage];
  const nextMessages = [...segmentedCurrent, ...appendedMessages];

  return {
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: nextMessages,
    },
    messageCountByTask: {
      ...args.messageCountByTask,
      [args.taskId]: Math.max(
        nextMessages.length,
        (args.messageCountByTask[args.taskId] ?? current.length) +
          appendedMessages.length,
      ),
    },
  };
}
