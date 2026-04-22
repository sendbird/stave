import type { ChatMessage, FileContextPart, MessagePart } from "@/types/chat";

export const MAX_PROVIDER_TEXT_FIELD_CHARS = 500_000;
export const MAX_FILE_CONTEXT_CONTENT_CHARS = MAX_PROVIDER_TEXT_FIELD_CHARS;
export const MAX_PROVIDER_FILE_CONTEXT_INSTRUCTION_CHARS = 5_000;
export const MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS = 5_000;
export const MAX_PROVIDER_USER_INPUT_QUESTION_CHARS = 5_000;
export const MAX_PROVIDER_USER_INPUT_HEADER_CHARS = 200;
export const MAX_PROVIDER_USER_INPUT_OPTION_LABEL_CHARS = 500;
export const MAX_PROVIDER_USER_INPUT_OPTION_DESCRIPTION_CHARS = 5_000;
export const MAX_PROVIDER_STAVE_PROCESSING_MODEL_CHARS = 200;
export const MAX_PROVIDER_STAVE_PROCESSING_REASON_CHARS = 5_000;
export const MAX_PROVIDER_ORCHESTRATION_SUBTASK_MODEL_CHARS = 200;
export const MAX_PROVIDER_ORCHESTRATION_SUBTASK_TITLE_CHARS = 5_000;
export const MAX_PROVIDER_ORCHESTRATION_SUPERVISOR_MODEL_CHARS = 200;

type FileContextPayload = Pick<FileContextPart, "type" | "filePath" | "content" | "language" | "instruction">;

const IMAGE_FILE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
];

function isImageFilePath(args: { filePath: string }) {
  const normalizedPath = args.filePath.toLowerCase();
  return IMAGE_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

function isImageFileContext(args: FileContextPayload) {
  return args.language === "image"
    || isImageFilePath({ filePath: args.filePath })
    || args.content.startsWith("data:image/");
}

function buildOmittedImagePayloadNotice(args: { originalLength: number }) {
  return `[image payload omitted: original content length ${args.originalLength} exceeds the ${MAX_FILE_CONTEXT_CONTENT_CHARS} character IPC limit]`;
}

function truncateOversizedTextContent(args: {
  content: string;
  originalLength: number;
  label: string;
  maxChars?: number;
}) {
  const maxChars = args.maxChars ?? MAX_PROVIDER_TEXT_FIELD_CHARS;
  const suffix = `\n\n[${args.label} truncated: original length ${args.originalLength} exceeds the ${maxChars} character IPC limit]`;
  const headLength = Math.max(0, maxChars - suffix.length);
  return `${args.content.slice(0, headLength)}${suffix}`.slice(0, maxChars);
}

export function sanitizeTextField(args: { value: string; label: string; maxChars?: number }) {
  const maxChars = args.maxChars ?? MAX_PROVIDER_TEXT_FIELD_CHARS;
  if (args.value.length <= maxChars) {
    return args.value;
  }

  return truncateOversizedTextContent({
    content: args.value,
    originalLength: args.value.length,
    label: args.label,
    maxChars,
  });
}

export function sanitizeFileContextPayload<T extends FileContextPayload>(part: T): T {
  const instruction = part.instruction == null
    ? part.instruction
    : sanitizeTextField({
        value: part.instruction,
        label: "file context instruction",
        maxChars: MAX_PROVIDER_FILE_CONTEXT_INSTRUCTION_CHARS,
      });

  if (part.content.length <= MAX_FILE_CONTEXT_CONTENT_CHARS && instruction === part.instruction) {
    return part;
  }

  const content = part.content.length <= MAX_FILE_CONTEXT_CONTENT_CHARS
    ? part.content
    : isImageFileContext(part)
      ? buildOmittedImagePayloadNotice({ originalLength: part.content.length })
      : truncateOversizedTextContent({
          content: part.content,
          originalLength: part.content.length,
          label: "content",
        });

  return {
    ...part,
    content,
    ...(instruction !== undefined ? { instruction } : {}),
  } as T;
}

export function sanitizeMessagePartPayload<T extends MessagePart>(part: T): T {
  switch (part.type) {
    case "text": {
      const text = sanitizeTextField({ value: part.text, label: "message text" });
      return text === part.text ? part : { ...part, text } as T;
    }
    case "thinking": {
      const text = sanitizeTextField({ value: part.text, label: "thinking text" });
      return text === part.text ? part : { ...part, text } as T;
    }
    case "tool_use": {
      const input = sanitizeTextField({ value: part.input, label: "tool input" });
      const output = part.output == null
        ? part.output
        : sanitizeTextField({ value: part.output, label: "tool output" });
      return input === part.input && output === part.output
        ? part
        : {
            ...part,
            input,
            ...(output != null ? { output } : {}),
          } as T;
    }
    case "code_diff": {
      const oldContent = sanitizeTextField({ value: part.oldContent, label: "diff old content" });
      const newContent = sanitizeTextField({ value: part.newContent, label: "diff new content" });
      return oldContent === part.oldContent && newContent === part.newContent
        ? part
        : {
            ...part,
            oldContent,
            newContent,
          } as T;
    }
    case "file_context":
      return sanitizeFileContextPayload(part) as T;
    case "image_context": {
      if (part.dataUrl.length <= MAX_PROVIDER_TEXT_FIELD_CHARS) {
        return part;
      }
      return {
        ...part,
        dataUrl: "",
      } as T;
    }
    case "system_event": {
      const content = sanitizeTextField({ value: part.content, label: "system event" });
      return content === part.content ? part : { ...part, content } as T;
    }
    case "orchestration_progress": {
      const supervisorModel = sanitizeTextField({
        value: part.supervisorModel,
        label: "orchestration supervisor model",
        maxChars: MAX_PROVIDER_ORCHESTRATION_SUPERVISOR_MODEL_CHARS,
      });
      const subtasks = part.subtasks.map((subtask) => ({
        ...subtask,
        title: sanitizeTextField({
          value: subtask.title,
          label: "orchestration subtask title",
          maxChars: MAX_PROVIDER_ORCHESTRATION_SUBTASK_TITLE_CHARS,
        }),
        model: sanitizeTextField({
          value: subtask.model,
          label: "orchestration subtask model",
          maxChars: MAX_PROVIDER_ORCHESTRATION_SUBTASK_MODEL_CHARS,
        }),
      }));
      const changed = supervisorModel !== part.supervisorModel
        || subtasks.some((subtask, index) => (
          subtask.title !== part.subtasks[index]?.title
          || subtask.model !== part.subtasks[index]?.model
        ));
      return changed
        ? {
            ...part,
            supervisorModel,
            subtasks,
          } as T
        : part;
    }
    case "stave_processing": {
      const model = part.model == null
        ? part.model
        : sanitizeTextField({
            value: part.model,
            label: "stave processing model",
            maxChars: MAX_PROVIDER_STAVE_PROCESSING_MODEL_CHARS,
          });
      const supervisorModel = part.supervisorModel == null
        ? part.supervisorModel
        : sanitizeTextField({
            value: part.supervisorModel,
            label: "stave processing supervisor model",
            maxChars: MAX_PROVIDER_STAVE_PROCESSING_MODEL_CHARS,
          });
      const reason = sanitizeTextField({
        value: part.reason,
        label: "stave processing reason",
        maxChars: MAX_PROVIDER_STAVE_PROCESSING_REASON_CHARS,
      });
      return model === part.model && supervisorModel === part.supervisorModel && reason === part.reason
        ? part
        : {
            ...part,
            ...(model !== undefined ? { model } : {}),
            ...(supervisorModel !== undefined ? { supervisorModel } : {}),
            reason,
          } as T;
    }
    case "approval": {
      const description = sanitizeTextField({
        value: part.description,
        label: "approval description",
        maxChars: MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
      });
      return description === part.description
        ? part
        : {
            ...part,
            description,
          } as T;
    }
    case "user_input": {
      const questions = part.questions.map((question) => ({
        ...question,
        ...(question.key !== undefined
          ? {
              key: sanitizeTextField({
                value: question.key,
                label: "user input key",
                maxChars: MAX_PROVIDER_USER_INPUT_HEADER_CHARS,
              }),
            }
          : {}),
        question: sanitizeTextField({
          value: question.question,
          label: "user input question",
          maxChars: MAX_PROVIDER_USER_INPUT_QUESTION_CHARS,
        }),
        header: sanitizeTextField({
          value: question.header,
          label: "user input header",
          maxChars: MAX_PROVIDER_USER_INPUT_HEADER_CHARS,
        }),
        options: question.options.map((option) => ({
          ...option,
          label: sanitizeTextField({
            value: option.label,
            label: "user input option label",
            maxChars: MAX_PROVIDER_USER_INPUT_OPTION_LABEL_CHARS,
          }),
          description: sanitizeTextField({
            value: option.description,
            label: "user input option description",
            maxChars: MAX_PROVIDER_USER_INPUT_OPTION_DESCRIPTION_CHARS,
          }),
        })),
        ...(question.placeholder !== undefined
          ? {
              placeholder: sanitizeTextField({
                value: question.placeholder,
                label: "user input placeholder",
                maxChars: MAX_PROVIDER_USER_INPUT_OPTION_LABEL_CHARS,
              }),
            }
          : {}),
        ...(question.defaultValue !== undefined
          ? {
              defaultValue: sanitizeTextField({
                value: question.defaultValue,
                label: "user input default value",
                maxChars: MAX_PROVIDER_USER_INPUT_QUESTION_CHARS,
              }),
            }
          : {}),
        ...(question.linkUrl !== undefined
          ? {
              linkUrl: sanitizeTextField({
                value: question.linkUrl,
                label: "user input link url",
                maxChars: MAX_PROVIDER_USER_INPUT_QUESTION_CHARS,
              }),
            }
          : {}),
      }));
      const changed = questions.some((question, questionIndex) => (
        question.key !== part.questions[questionIndex]?.key
        || question.question !== part.questions[questionIndex]?.question
        || question.header !== part.questions[questionIndex]?.header
        || question.placeholder !== part.questions[questionIndex]?.placeholder
        || question.defaultValue !== part.questions[questionIndex]?.defaultValue
        || question.linkUrl !== part.questions[questionIndex]?.linkUrl
        || question.options.some((option, optionIndex) => (
          option.label !== part.questions[questionIndex]?.options[optionIndex]?.label
          || option.description !== part.questions[questionIndex]?.options[optionIndex]?.description
        ))
      ));

      return changed
        ? {
            ...part,
            questions,
          } as T
        : part;
    }
  }
}

export function sanitizeChatMessagePayload(message: ChatMessage): ChatMessage {
  const content = sanitizeTextField({
    value: message.content,
    label: `${message.role} message content`,
  });
  const planText = message.planText == null
    ? message.planText
    : sanitizeTextField({ value: message.planText, label: "plan text" });
  const parts = message.parts.map((part) => sanitizeMessagePartPayload(part));
  const partsChanged = parts.some((part, index) => part !== message.parts[index]);

  if (content === message.content && planText === message.planText && !partsChanged) {
    return message;
  }

  return {
    ...message,
    content,
    ...(planText !== undefined ? { planText } : {}),
    parts,
  };
}
