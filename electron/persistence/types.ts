import type { PromptDraft } from "../../src/types/chat";
import type {
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "../../src/lib/terminal/types";
import type { WorkspaceInformationState } from "../../src/lib/workspace-information";

export interface PersistenceTaskRow {
  id: string;
  title: string;
  provider: "claude-code" | "codex" | "stave";
  updatedAt: string;
  unread: boolean;
  archivedAt?: string | null;
  controlMode?: "interactive" | "managed";
  controlOwner?: "stave" | "external";
}

export interface PersistenceChatMessageRow {
  id: string;
  role: "user" | "assistant";
  model: string;
  providerId: string;
  content: string;
  isStreaming?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
  };
  promptSuggestions?: string[];
  parts: unknown[];
}

export interface PersistenceWorkspaceSnapshot {
  activeTaskId: string;
  tasks: PersistenceTaskRow[];
  messagesByTask: Record<string, PersistenceChatMessageRow[]>;
  promptDraftByTask?: Record<string, PromptDraft>;
  providerSessionByTask?: Record<string, {
    "claude-code"?: string;
    codex?: string;
    stave?: string;
  }>;
  editorTabs?: Array<{
    id: string;
    filePath: string;
    kind?: "text" | "image";
    language: string;
    content?: string;
    contentState?: "ready" | "deferred" | "loading";
    originalContent?: string;
    savedContent?: string;
    baseRevision?: string | null;
    hasConflict: boolean;
    isDirty: boolean;
  }>;
  activeEditorTabId?: string | null;
  terminalTabs?: WorkspaceTerminalTab[];
  activeTerminalTabId?: string | null;
  terminalDocked?: boolean;
  cliSessionTabs?: WorkspaceCliSessionTab[];
  activeCliSessionTabId?: string | null;
  activeSurface?: WorkspaceActiveSurface;
  workspaceInformation?: WorkspaceInformationState;
}

export interface PersistenceWorkspaceShell {
  activeTaskId: string;
  tasks: PersistenceTaskRow[];
  promptDraftByTask?: Record<string, PromptDraft>;
  providerSessionByTask?: Record<string, {
    "claude-code"?: string;
    codex?: string;
    stave?: string;
  }>;
  editorTabs?: Array<{
    id: string;
    filePath: string;
    kind?: "text" | "image";
    language: string;
    content?: string;
    contentState?: "ready" | "deferred" | "loading";
    originalContent?: string;
    savedContent?: string;
    baseRevision?: string | null;
    hasConflict: boolean;
    isDirty: boolean;
  }>;
  activeEditorTabId?: string | null;
  terminalTabs?: WorkspaceTerminalTab[];
  activeTerminalTabId?: string | null;
  terminalDocked?: boolean;
  cliSessionTabs?: WorkspaceCliSessionTab[];
  activeCliSessionTabId?: string | null;
  activeSurface?: WorkspaceActiveSurface;
  workspaceInformation?: WorkspaceInformationState;
  messageCountByTask?: Record<string, number>;
}

export interface PersistenceWorkspaceShellLite {
  activeTaskId: string;
  tasks: PersistenceTaskRow[];
  promptDraftByTask?: Record<string, PromptDraft>;
  providerSessionByTask?: Record<string, {
    "claude-code"?: string;
    codex?: string;
    stave?: string;
  }>;
  messageCountByTask?: Record<string, number>;
}

export interface PersistenceWorkspaceShellSummary {
  activeTaskId: string;
  tasks: PersistenceTaskRow[];
  messageCountByTask?: Record<string, number>;
  terminalTabCount?: number;
  cliSessionTabCount?: number;
}

export interface PersistenceWorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PersistenceTaskMessagesPage {
  messages: PersistenceChatMessageRow[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMoreOlder: boolean;
}

export interface PersistenceProjectRegistryEntry {
  projectPath: string;
  projectName: string;
  lastOpenedAt: string;
  defaultBranch: string;
  workspaces: Array<{
    id: string;
    name: string;
    updatedAt: string;
  }>;
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  projectBasePrompt?: string;
  newWorkspaceInitCommand?: string;
  newWorkspaceUseRootNodeModulesSymlink?: boolean;
}

export interface PersistenceTurnSummary {
  id: string;
  workspaceId: string;
  taskId: string;
  providerId: "claude-code" | "codex";
  createdAt: string;
  completedAt: string | null;
}

export interface PersistenceLocalMcpRequestLog {
  id: string;
  httpMethod: string;
  path: string;
  rpcMethod: string | null;
  rpcRequestId: string | null;
  toolName: string | null;
  statusCode: number;
  durationMs: number;
  hasRequestPayload: boolean;
  requestPayload: unknown | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface PersistenceLocalMcpRequestLogCreateInput extends Omit<PersistenceLocalMcpRequestLog, "createdAt" | "hasRequestPayload"> {
  createdAt?: string;
}

export interface PersistenceLocalMcpRequestLogPage {
  logs: PersistenceLocalMcpRequestLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type PersistenceNotificationKind =
  | "task.turn_completed"
  | "task.approval_requested";

export type PersistenceNotificationAction =
  | {
      type: "approval";
      requestId: string;
      messageId?: string | null;
    };

export interface PersistenceNotificationRecord {
  id: string;
  kind: PersistenceNotificationKind;
  title: string;
  body: string;
  projectPath: string | null;
  projectName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  turnId: string | null;
  providerId: "claude-code" | "codex" | "stave" | null;
  action: PersistenceNotificationAction | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface PersistenceNotificationCreateInput extends Omit<PersistenceNotificationRecord, "createdAt" | "readAt"> {
  createdAt?: string;
  readAt?: string | null;
  dedupeKey?: string | null;
}

export interface PersistenceRpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface PersistenceRpcSuccessResponse<TResult = unknown> {
  id: string;
  ok: true;
  result: TResult;
}

export interface PersistenceRpcErrorResponse {
  id: string;
  ok: false;
  error: string;
}

export type PersistenceRpcResponse<TResult = unknown> =
  | PersistenceRpcSuccessResponse<TResult>
  | PersistenceRpcErrorResponse;
