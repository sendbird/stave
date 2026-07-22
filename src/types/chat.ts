import type { LensAnnotation } from "@/lib/lens/lens.types";
import type { WorkspaceInformationReference } from "@/lib/workspace-information-references";

export type MessageRole = "user" | "assistant";

export type MessagePartType =
  | "text"
  | "thinking"
  | "tool_use"
  | "code_diff"
  | "file_context"
  | "image_context"
  | "workspace_information_context"
  | "approval"
  | "user_input"
  | "system_event";

export type Attachment =
  | { kind: "file"; filePath: string }
  | {
      kind: "image";
      id: string;
      dataUrl: string;
      label: string;
      mimeType?: string;
    }
  | {
      kind: "workspace-information";
      id: string;
      reference: WorkspaceInformationReference;
    }
  | {
      kind: "lens-annotations";
      id: string;
      workspaceId?: string;
      label: string;
      count: number;
      summary: string;
      content: string;
      displayContent?: string;
      annotations?: LensAnnotation[];
    };

export type ClaudePermissionMode =
  "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";
export type ClaudePermissionModeBeforePlan = Exclude<
  ClaudePermissionMode,
  "plan"
> | null;

/**
 * How aggressively Stave auto-approves tool calls while Claude is in plan mode.
 *
 * Plan mode is read-only by construction: mutating file tools (Edit/Write/…)
 * and mutating Bash commands are hard-denied regardless of this setting. These
 * levels only relax the approval *prompt* for tool calls that cannot mutate the
 * workspace, so higher levels mean fewer interruptions during planning.
 *
 * - `strict`: only the built-in read-only tools (Read/Grep/Glob/…) and Stave
 *   workspace MCP tools are auto-allowed; non-mutating Bash, subagents (Task),
 *   and third-party MCP tools still prompt. This is the original behavior.
 * - `bash`: additionally auto-allow non-mutating Bash commands.
 * - `bashAndTask`: additionally auto-allow spawning subagents via the Task tool.
 * - `bashTaskAndMcp`: additionally auto-allow read-only third-party / lens MCP
 *   tools (classified by tool-name verbs). Mutating-looking MCP tools still
 *   prompt.
 */
export type ClaudePlanModeApprovalScope =
  "strict" | "bash" | "bashAndTask" | "bashTaskAndMcp";

/**
 * Default plan-mode approval scope. The broadest level, so plan mode feels as
 * frictionless as auto mode while still hard-denying every mutating action.
 */
export const DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE: ClaudePlanModeApprovalScope =
  "bashTaskAndMcp";

export interface PromptDraftRuntimeOverrides {
  claudePermissionMode?: ClaudePermissionMode;
  claudePermissionModeBeforePlan?: ClaudePermissionModeBeforePlan;
  claudeEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  codexPlanMode?: boolean;
  codexReasoningEffort?:
    "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
  autoRouting?: boolean;
  model?: string;
}

export interface PromptDraftQueuedNextTurn {
  queuedAt: string;
  sourceTurnId?: string;
  content?: string;
}

export interface PromptDraftQueuedTurn {
  id: string;
  queuedAt: string;
  sourceTurnId?: string;
  content: string;
  attachedFilePaths: string[];
  attachments: Attachment[];
}

export interface PromptDraftBatchItem {
  id: string;
  createdAt: string;
  content: string;
  attachedFilePaths?: string[];
  attachments?: Attachment[];
}

export interface PromptDraft {
  text: string;
  attachedFilePaths: string[];
  attachments: Attachment[];
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  promptBatch?: PromptDraftBatchItem[];
  queuedTurns?: PromptDraftQueuedTurn[];
  /** Legacy single-item queue kept for reading older persisted drafts. */
  queuedNextTurn?: PromptDraftQueuedNextTurn;
}

export interface MessagePartBase {
  type: MessagePartType;
}

export interface TextPart extends MessagePartBase {
  type: "text";
  text: string;
  /** Preserves provider-side text item boundaries across streamed deltas. */
  segmentId?: string;
}

export interface ThinkingPart extends MessagePartBase {
  type: "thinking";
  text: string;
  isStreaming: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface ToolUsePart extends MessagePartBase {
  type: "tool_use";
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state:
    "input-streaming" | "input-available" | "output-available" | "output-error";
  elapsedSeconds?: number;
  /** Progress messages streamed from a running subagent (Agent tool only). */
  progressMessages?: string[];
}

export interface CodeDiffPart extends MessagePartBase {
  type: "code_diff";
  filePath: string;
  oldContent: string;
  newContent: string;
  status: "pending" | "accepted" | "rejected";
}

export interface FileContextPart extends MessagePartBase {
  type: "file_context";
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}

export interface ApprovalPart extends MessagePartBase {
  type: "approval";
  toolName: string;
  description: string;
  input?: string;
  requestId: string;
  state:
    | "approval-requested"
    | "approval-responded"
    | "approval-interrupted"
    | "output-denied";
}

export interface UserInputOption {
  label: string;
  description: string;
}

export interface UserInputQuestion {
  key?: string;
  question: string;
  header: string;
  options: UserInputOption[];
  multiSelect?: boolean;
  inputType?: "text" | "number" | "integer" | "boolean" | "url_notice";
  required?: boolean;
  placeholder?: string;
  allowCustom?: boolean;
  defaultValue?: string;
  linkUrl?: string;
}

export interface UserInputPart extends MessagePartBase {
  type: "user_input";
  requestId: string;
  toolName: string;
  questions: UserInputQuestion[];
  answers?: Record<string, string>;
  state:
    | "input-requested"
    | "input-responded"
    | "input-interrupted"
    | "input-denied";
}

export interface ImageContextPart extends MessagePartBase {
  type: "image_context";
  dataUrl: string;
  label: string;
  mimeType: string;
}

export interface WorkspaceInformationContextPart extends MessagePartBase {
  type: "workspace_information_context";
  reference: WorkspaceInformationReference;
}

export interface SystemEventPart extends MessagePartBase {
  type: "system_event";
  content: string;
  compactBoundary?: {
    trigger?: string;
    gitRef?: string;
  };
}

export type MessagePart =
  | TextPart
  | ThinkingPart
  | ToolUsePart
  | CodeDiffPart
  | FileContextPart
  | ImageContextPart
  | WorkspaceInformationContextPart
  | ApprovalPart
  | UserInputPart
  | SystemEventPart;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  model: string;
  providerId: "claude-code" | "codex" | "user";
  content: string;
  displayContent?: string;
  startedAt?: string;
  completedAt?: string;
  isStreaming?: boolean;
  isPlanResponse?: boolean;
  planText?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
    ttftMs?: number;
  };
  promptSuggestions?: string[];
  parts: MessagePart[];
  displayParts?: MessagePart[];
  /**
   * Set on a user message that was steered (injected) into an already-running
   * turn rather than starting a new one. Records the turnId it was injected
   * into. Absent for normal user messages.
   */
  steeredIntoTurnId?: string;
}

export type EditorTabContentState =
  "ready" | "deferred" | "loading" | "too-large";

export type TaskControlMode = "interactive" | "managed";
export type TaskControlOwner = "stave" | "external";

export interface Task {
  id: string;
  title: string;
  provider: "claude-code" | "codex";
  updatedAt: string;
  unread: boolean;
  archivedAt?: string | null;
  controlMode: TaskControlMode;
  controlOwner: TaskControlOwner;
  /** Legacy relative paths to persisted plan files kept for snapshot compatibility. */
  planFilePaths?: string[];
  /** Legacy branch marker pruned from persisted workspaces on load. */
  coliseumParentTaskId?: string | null;
}

export interface EditorTab {
  id: string;
  filePath: string;
  kind?: "text" | "image" | "git-graph";
  language: string;
  content: string;
  contentState?: EditorTabContentState;
  originalContent?: string;
  savedContent?: string;
  baseRevision?: string | null;
  fileSizeBytes?: number;
  fileSizeLimitBytes?: number;
  hasConflict: boolean;
  isDirty: boolean;
}
