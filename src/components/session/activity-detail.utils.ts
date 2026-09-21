import { historyText, type AgentHistoryEntry } from "@/lib/providers/agent-history";
import type { ChatMessage, MessagePart } from "@/types/chat";

export type ActivityEntrySource = "live" | "saved" | "provider";

export interface ActivityLogEntry extends AgentHistoryEntry {
  source: ActivityEntrySource;
}

interface ActivityMessageState {
  activeWorkspaceId: string;
  messagesByTask: Record<string, ChatMessage[]>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceRuntimeCacheById: Record<
    string,
    { messagesByTask: Record<string, ChatMessage[]> } | undefined
  >;
}

export function selectActivityMessages(args: {
  state: ActivityMessageState;
  parentTaskId: string;
  childTaskId?: string;
  childWorkspaceId?: string;
}): ChatMessage[] {
  if (!args.childTaskId) {
    return args.state.messagesByTask[args.parentTaskId] ?? [];
  }
  const workspaceId = args.childWorkspaceId ??
    args.state.taskWorkspaceIdById[args.childTaskId];
  if (!workspaceId) return [];
  if (workspaceId === args.state.activeWorkspaceId) {
    return args.state.messagesByTask[args.childTaskId] ?? [];
  }
  return args.state.workspaceRuntimeCacheById[workspaceId]
    ?.messagesByTask[args.childTaskId] ?? [];
}

function describePart(part: MessagePart, role: ChatMessage["role"]) {
  switch (part.type) {
    case "text":
      return {
        title: role === "user" ? "Prompt" : "Response",
        text: part.text,
      };
    case "thinking":
      return { title: "Thinking", text: part.text };
    case "tool_use":
      return {
        title: `${part.toolName} · ${part.state}`,
        text: [
          part.input,
          ...(part.progressMessages ?? []),
          part.output ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "approval":
      return {
        title: `${part.toolName} · ${part.state}`,
        text: [part.description, part.input ?? ""].filter(Boolean).join("\n"),
      };
    case "user_input":
      return {
        title: `${part.toolName} · ${part.state}`,
        text: historyText({ questions: part.questions, answers: part.answers }),
      };
    case "system_event":
      return { title: "System event", text: part.content };
    case "code_diff":
      return { title: `Code change · ${part.status}`, text: part.filePath };
    case "file_context":
      return { title: "File context", text: part.filePath };
    case "image_context":
      return { title: "Image context", text: part.label };
    case "workspace_information_context":
      return {
        title: "Workspace context",
        text: "Workspace information was attached to this turn.",
      };
  }
}

export function messagesToActivityEntries(
  messages: readonly ChatMessage[],
  source: Exclude<ActivityEntrySource, "provider">,
): ActivityLogEntry[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part, index) => {
      const described = describePart(part, message.role);
      if (!described.text.trim()) return [];
      return [
        {
          id: `${message.id}:${index}`,
          ...described,
          ...(message.role === "assistant" && message.model
            ? { model: message.model }
            : {}),
          source,
        },
      ];
    }),
  );
}

/**
 * Keep saved history as the stable spine, then replace matching rows with the
 * live store version and append newly streamed rows. Map replacement preserves
 * the original position, so an update never jumps an existing row.
 */
export function mergeActivityEntries(
  ...groups: readonly (readonly ActivityLogEntry[])[]
): ActivityLogEntry[] {
  const byId = new Map<string, ActivityLogEntry>();
  for (const entries of groups) {
    for (const entry of entries) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export function providerEntriesToActivityEntries(
  entries: readonly AgentHistoryEntry[],
): ActivityLogEntry[] {
  return entries.map((entry) => ({ ...entry, source: "provider" }));
}
