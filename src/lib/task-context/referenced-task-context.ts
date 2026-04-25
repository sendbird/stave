import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import type { ChatMessage, Task } from "@/types/chat";

const STAVE_TASK_ID_PATTERN = /\b(?:stave\s+task\s+id|taskid|task\s+id)\s*[:#]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
const MAX_REFERENCED_TASKS = 5;
const MAX_REPLY_CHARS = 1600;

function truncateForPrompt(text: string, maxChars = MAX_REPLY_CHARS) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 15)).trimEnd()}\n...[truncated]`;
}

function findLatestAssistantReply(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    const content = message.content.trim() || message.planText?.trim() || "";
    if (content.length > 0) {
      return content;
    }
  }
  return null;
}

export function extractReferencedTaskIds(args: { text: string }) {
  const matches = args.text.matchAll(STAVE_TASK_ID_PATTERN);
  const ids = new Set<string>();
  for (const match of matches) {
    const taskId = match[1]?.trim();
    if (taskId) {
      ids.add(taskId);
    }
  }
  return [...ids];
}

export function buildReferencedTaskRetrievedContext(args: {
  prompt: string;
  currentTaskId?: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
}): CanonicalRetrievedContextPart | null {
  const referencedTaskIds = extractReferencedTaskIds({ text: args.prompt })
    .filter((taskId) => taskId !== args.currentTaskId)
    .slice(0, MAX_REFERENCED_TASKS);

  if (referencedTaskIds.length === 0) {
    return null;
  }

  const sections: string[] = [
    "Referenced Stave task context resolved from the current workspace state.",
    "Use this retrieved context instead of searching the filesystem for task ids.",
    "Do not scan the home directory or hidden runtime folders to discover task history.",
  ];

  const unresolved: string[] = [];
  for (const taskId of referencedTaskIds) {
    const task = args.tasks.find((item) => item.id === taskId) ?? null;
    const taskMessages = args.messagesByTask[taskId];
    const latestReply = Array.isArray(taskMessages) ? findLatestAssistantReply(taskMessages) : null;

    if (!task && !taskMessages) {
      unresolved.push(`${taskId}: not found in the currently loaded workspace state`);
      continue;
    }

    sections.push([
      `stave task id: ${taskId}`,
      `title: ${task?.title?.trim() || "(unknown)"}`,
      latestReply
        ? `latest assistant reply:\n${truncateForPrompt(latestReply)}`
        : "latest assistant reply: (not currently loaded)",
    ].join("\n"));
  }

  if (unresolved.length > 0) {
    sections.push([
      "Unresolved task ids:",
      ...unresolved.map((line) => `- ${line}`),
      "If more context is required, ask the user to load or paste the missing task content instead of searching the filesystem.",
    ].join("\n"));
  }

  return {
    type: "retrieved_context",
    sourceId: "stave:referenced-task-replies",
    title: "Referenced Stave Task Replies",
    content: sections.join("\n\n"),
  };
}
