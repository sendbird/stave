import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import { resolvePathBaseName } from "@/lib/path-utils";
import {
  updateApprovalPartsByRequestId,
  updateUserInputPartsByRequestId,
} from "@/store/provider-message.utils";
import type { ChatMessage } from "@/types/chat";

export function resolveLanguage(args: { filePath: string }) {
  if (isImageFilePath({ filePath: args.filePath })) {
    return "image";
  }
  const path = args.filePath.toLowerCase();
  const ext = path.slice(path.lastIndexOf("."));
  const extMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".jsonc": "json",
    ".md": "markdown",
    ".mdx": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
    ".svg": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "ini",
    ".py": "python",
    ".pyi": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".fish": "shell",
    ".ps1": "powershell",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".dockerfile": "dockerfile",
    ".tf": "hcl",
    ".lua": "lua",
    ".r": "r",
    ".dart": "dart",
    ".vue": "html",
    ".svelte": "html",
  };
  if (extMap[ext]) {
    return extMap[ext];
  }
  const basename = resolvePathBaseName({ path });
  if (basename === "dockerfile" || basename.startsWith("dockerfile.")) {
    return "dockerfile";
  }
  if (basename === "makefile" || basename === "gnumakefile") {
    return "makefile";
  }
  return "plaintext";
}

export function normalizeProviderTimeoutMs(args: { value: number | null | undefined }) {
  return PROVIDER_TIMEOUT_OPTIONS.includes(args.value as (typeof PROVIDER_TIMEOUT_OPTIONS)[number])
    ? args.value!
    : DEFAULT_PROVIDER_TIMEOUT_MS;
}

export function isImageFilePath(args: { filePath: string }) {
  const value = args.filePath.toLowerCase();
  return value.endsWith(".png")
    || value.endsWith(".jpg")
    || value.endsWith(".jpeg")
    || value.endsWith(".gif")
    || value.endsWith(".webp")
    || value.endsWith(".svg")
    || value.endsWith(".bmp")
    || value.endsWith(".ico")
    || value.endsWith(".avif");
}

export function canSendEditorContextToTask(args: {
  taskId?: string | null;
  hasActiveEditorTab: boolean;
  isTaskResponding: boolean;
}) {
  return canSendWorkspaceFileToTask({
    taskId: args.taskId,
    filePath: args.hasActiveEditorTab ? "__active-editor-tab__" : "",
    isTaskResponding: args.isTaskResponding,
  });
}

export function canSendWorkspaceFileToTask(args: {
  taskId?: string | null;
  filePath?: string | null;
  isTaskResponding: boolean;
}) {
  return Boolean(
    args.filePath?.trim()
    && args.taskId
    && !args.isTaskResponding,
  );
}

export function updateMessageById(args: {
  messages: ChatMessage[];
  messageId: string;
  update: (message: ChatMessage) => ChatMessage;
}) {
  return args.messages.map((message) =>
    message.id === args.messageId ? args.update(message) : message
  );
}

export function applyApprovalState(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  workspaceSnapshotVersion: number;
  taskId: string;
  messageId: string;
  requestId: string;
  approved: boolean;
}): { messagesByTask: Record<string, ChatMessage[]>; workspaceSnapshotVersion: number } {
  const current = args.messagesByTask[args.taskId] ?? [];
  return {
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: updateMessageById({
        messages: current,
        messageId: args.messageId,
        update: (message) => ({
          ...message,
          parts: updateApprovalPartsByRequestId({
            parts: message.parts,
            requestId: args.requestId,
            approved: args.approved,
          }),
        }),
      }),
    },
    workspaceSnapshotVersion: args.workspaceSnapshotVersion + 1,
  };
}

export function applyUserInputState(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  workspaceSnapshotVersion: number;
  taskId: string;
  messageId: string;
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}): { messagesByTask: Record<string, ChatMessage[]>; workspaceSnapshotVersion: number } {
  const current = args.messagesByTask[args.taskId] ?? [];
  return {
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: updateMessageById({
        messages: current,
        messageId: args.messageId,
        update: (message) => ({
          ...message,
          parts: updateUserInputPartsByRequestId({
            parts: message.parts,
            requestId: args.requestId,
            answers: args.answers,
            denied: args.denied,
          }),
        }),
      }),
    },
    workspaceSnapshotVersion: args.workspaceSnapshotVersion + 1,
  };
}
