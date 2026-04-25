import { sanitizeFileContextPayload } from "@/lib/file-context-sanitization";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ChatMessage,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  Task,
  TextPart,
} from "@/types/chat";

export function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

export function buildRecentTimestamp() {
  return new Date().toISOString();
}

export function createUserTextPart(args: { text: string }): TextPart {
  return {
    type: "text",
    text: args.text,
  };
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
  const userMessageId = buildMessageId({ taskId: args.taskId, count: current.length });
  const assistantMessageId = buildMessageId({ taskId: args.taskId, count: current.length + 1 });
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
  content: string;
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
  const userMessageId = buildMessageId({ taskId: args.taskId, count: current.length });
  const assistantMessageId = buildMessageId({ taskId: args.taskId, count: current.length + 1 });
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

  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    parts: userParts.length > 0 ? userParts : [createUserTextPart({ text: args.content })],
  };

  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    model: args.activeModel,
    providerId: args.provider,
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
