import type { ChatMessage, FileContextPart, ImageContextPart, MessagePart } from "@/types/chat";
import {
  sanitizeChatMessagePayload,
  sanitizeFileContextPayload,
} from "@/lib/file-context-sanitization";
import { getAssistantResponseTextStartIndex } from "@/lib/session/assistant-response-parts";
import type { SkillPromptContext } from "@/lib/skills/types";
import type {
  CanonicalConversationMessage,
  CanonicalConversationRequest,
  CanonicalRetrievedContextPart,
  CanonicalSkillContextPart,
  ProviderId,
} from "./provider.types";

function cloneMessagePart(part: MessagePart): MessagePart {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: part.text,
        ...(part.segmentId ? { segmentId: part.segmentId } : {}),
      };
    case "thinking":
      return {
        type: "thinking",
        text: part.text,
        isStreaming: part.isStreaming,
      };
    case "tool_use":
      return {
        // Strip renderer-only tool metadata such as elapsedSeconds and
        // progressMessages. The provider IPC contract only accepts canonical
        // history fields and rejects unknown keys.
        type: "tool_use",
        ...(part.toolUseId ? { toolUseId: part.toolUseId } : {}),
        toolName: part.toolName,
        input: part.input,
        ...(part.output !== undefined ? { output: part.output } : {}),
        state: part.state,
      };
    case "code_diff":
      return {
        type: "code_diff",
        filePath: part.filePath,
        oldContent: part.oldContent,
        newContent: part.newContent,
        status: part.status,
      };
    case "file_context":
      return {
        type: "file_context",
        filePath: part.filePath,
        content: part.content,
        language: part.language,
        ...(part.instruction !== undefined ? { instruction: part.instruction } : {}),
      };
    case "image_context":
      return {
        type: "image_context",
        dataUrl: part.dataUrl,
        label: part.label,
        mimeType: part.mimeType,
      };
    case "approval":
      return {
        type: "approval",
        toolName: part.toolName,
        description: part.description,
        requestId: part.requestId,
        state: part.state,
      };
    case "user_input":
      return {
        type: "user_input",
        requestId: part.requestId,
        toolName: part.toolName,
        questions: part.questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({ ...option })),
        })),
        ...(part.answers ? { answers: { ...part.answers } } : {}),
        state: part.state,
      };
    case "system_event":
      return {
        type: "system_event",
        content: part.content,
      };
    case "orchestration_progress":
      return {
        type: "orchestration_progress",
        supervisorModel: part.supervisorModel,
        subtasks: part.subtasks.map((subtask) => ({ ...subtask })),
        status: part.status,
      };
    case "stave_processing":
      return {
        type: "stave_processing",
        strategy: part.strategy,
        ...(part.model !== undefined ? { model: part.model } : {}),
        ...(part.supervisorModel !== undefined ? { supervisorModel: part.supervisorModel } : {}),
        reason: part.reason,
        ...(part.fastModeRequested !== undefined ? { fastModeRequested: part.fastModeRequested } : {}),
        ...(part.fastModeApplied !== undefined ? { fastModeApplied: part.fastModeApplied } : {}),
      };
  }
}

function cloneContextPart(part: FileContextPart | CanonicalRetrievedContextPart | ImageContextPart | CanonicalSkillContextPart) {
  if (part.type === "retrieved_context") {
    return { ...part };
  }
  if (part.type === "skill_context") {
    return {
      ...part,
      skills: part.skills.map((skill) => ({ ...skill })),
    };
  }
  if (part.type === "image_context") {
    return { ...part };
  }
  return sanitizeFileContextPayload({ ...part });
}

function deriveCanonicalMessageContent(message: ChatMessage) {
  const responseStartIndex = getAssistantResponseTextStartIndex(message.parts);

  const trailingText = message.parts
    .flatMap((part, index) => (
      part.type === "text" && responseStartIndex !== -1 && index >= responseStartIndex ? [part.text] : []
    ))
    .join("");

  return trailingText.trim().length > 0 ? trailingText : message.content;
}

export function toCanonicalConversationMessage(args: {
  message: ChatMessage;
}): CanonicalConversationMessage {
  const sanitizedMessage = sanitizeChatMessagePayload(args.message);
  return {
    messageId: sanitizedMessage.id,
    role: sanitizedMessage.role,
    providerId: sanitizedMessage.providerId,
    model: sanitizedMessage.model,
    content: deriveCanonicalMessageContent(sanitizedMessage),
    parts: sanitizedMessage.parts.map((part) => cloneMessagePart(part)),
    isPlanResponse: sanitizedMessage.isPlanResponse,
    planText: sanitizedMessage.planText,
  };
}

export function buildCanonicalConversationRequest(args: {
  turnId?: string;
  taskId?: string;
  workspaceId?: string;
  providerId: ProviderId;
  model?: string;
  history: ChatMessage[];
  userInput: string;
  mode?: CanonicalConversationRequest["mode"];
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
  skillContexts?: SkillPromptContext[];
  nativeSessionId?: string | null;
  retrievedContextParts?: CanonicalRetrievedContextPart[];
}): CanonicalConversationRequest {
  const contextParts: CanonicalConversationRequest["contextParts"] = [];
  if (args.fileContexts) {
    for (const fc of args.fileContexts) {
      contextParts.push(sanitizeFileContextPayload({
        type: "file_context",
        filePath: fc.filePath,
        content: fc.content,
        language: fc.language,
        instruction: fc.instruction,
      }));
    }
  }
  if (args.imageContexts) {
    for (const ic of args.imageContexts) {
      contextParts.push({
        type: "image_context",
        dataUrl: ic.dataUrl,
        label: ic.label,
        mimeType: ic.mimeType,
      });
    }
  }
  args.retrievedContextParts?.forEach((part) => {
    contextParts.push(cloneContextPart(part));
  });
  if (args.skillContexts && args.skillContexts.length > 0) {
    contextParts.push({
      type: "skill_context",
      skills: args.skillContexts.map((skill) => ({ ...skill })),
    });
  }

  return {
    turnId: args.turnId,
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    target: {
      providerId: args.providerId,
      model: args.model,
    },
    mode: args.mode ?? "chat",
    history: args.history.map((message) => toCanonicalConversationMessage({ message })),
    input: {
      role: "user",
      providerId: "user",
      model: "user",
      content: args.userInput,
      parts: args.userInput.trim().length > 0
        ? [{ type: "text", text: args.userInput }]
        : [],
    },
    contextParts,
    resume: args.nativeSessionId?.trim()
      ? { nativeSessionId: args.nativeSessionId.trim() }
      : undefined,
  };
}

function canonicalPartToContextText(part: CanonicalConversationMessage["parts"][number]) {
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
      return `[image: ${part.label}]`;
    case "approval":
      return `[approval:${part.toolName}] ${part.description} state=${part.state}`;
    case "user_input":
      return `[user_input:${part.toolName}] questions=${part.questions.length} state=${part.state}`;
    case "system_event":
      return `[system] ${part.content}`;
  }
}

function toHistoryLine(args: { message: CanonicalConversationMessage }) {
  const primary = args.message.content.trim();
  if (primary.length > 0) {
    return `${args.message.role}: ${primary}`;
  }
  if (args.message.isPlanResponse && args.message.planText?.trim()) {
    return `${args.message.role}: ${args.message.planText.trim()}`;
  }
  const partText = args.message.parts.map((part) => canonicalPartToContextText(part)).join(" | ").trim();
  return `${args.message.role}: ${partText}`;
}

export function buildLegacyPromptFromCanonicalRequest(args: {
  request: CanonicalConversationRequest;
  includeHistory?: boolean;
  includeSkillContext?: boolean;
}) {
  const maxHistoryChars = 12000;
  const hasVisibleSkillContext = args.request.contextParts.some(
    (part) =>
      part.type === "skill_context"
      && part.skills.length > 0
      && args.includeSkillContext !== false,
  );
  const sections = [
    ...((args.request.workspaceId || args.request.taskId)
      ? [
          "[Stave Workspace Context]",
          [
            args.request.workspaceId ? `workspaceId: ${args.request.workspaceId}` : null,
            args.request.taskId ? `taskId: ${args.request.taskId}` : null,
            "workspacePlanDirectory: .stave/context/plans",
            "newWorkspacePlanFiles: .stave/context/plans/<taskIdPrefix>_<timestamp>.md",
            "handoffConvention: write plan files (not workspace notes) when handing off to a new workspace; notes carry only a pointer to the plan file, and the source workspace's plan/notes/todos must not be copied verbatim into the target.",
          ].filter(Boolean).join("\n"),
        ]
      : []),
    ...(args.includeHistory !== false
      ? [
          "[Task Shared Context]",
          args.request.history
            .map((message) => toHistoryLine({ message }))
            .join("\n")
            .slice(-maxHistoryChars) || "(no prior messages)",
        ]
      : []),
  ];

  args.request.contextParts.forEach((part) => {
    if (part.type === "file_context") {
      sections.push(
        "[Selected File Context]",
        `file: ${part.filePath}`,
        `language: ${part.language}`,
        part.instruction ? `instruction: ${part.instruction}` : "instruction: (none)",
        part.content,
      );
      return;
    }

    if (part.type === "image_context") {
      sections.push(
        "[Image Attachment]",
        `label: ${part.label}`,
        `type: ${part.mimeType}`,
      );
      return;
    }

    if (part.type === "skill_context") {
      if (args.includeSkillContext === false || part.skills.length === 0) {
        return;
      }
      sections.push(
        "[Activated Skills]",
        "These skills are already activated by Stave via `$skill` tokens.",
        "Run their instructions directly in this turn instead of calling provider-native Skill tools for the same slug.",
      );
      for (const skill of part.skills) {
        sections.push(
          `name: ${skill.name}`,
          `slug: ${skill.slug}`,
          `scope: ${skill.scope}`,
          `provider: ${skill.provider}`,
          `path: ${skill.path}`,
          skill.instructions,
        );
      }
      return;
    }

    sections.push(
      "[Retrieved Context]",
      `source: ${part.sourceId}`,
      part.title ? `title: ${part.title}` : "title: (none)",
      part.content,
    );
  });

  const trimmedInput = args.request.input.content.trim();
  sections.push(
    "[Current User Input]",
    trimmedInput.length > 0 ? args.request.input.content : "(none)",
  );
  if (trimmedInput.length === 0 && hasVisibleSkillContext) {
    sections.push(
      "[Skill Invocation]",
      "The user intentionally activated one or more skills without additional text. Follow the activated skill instructions.",
    );
  }

  return sections.join("\n\n");
}
