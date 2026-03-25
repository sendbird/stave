import type { CanonicalConversationRequest, ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import type { ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";
import type { SkillCatalogResponse } from "@/lib/skills/types";

interface ProviderStreamTurnArgs {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

type ProviderStreamTurnResult =
  | unknown[]
  | AsyncIterable<unknown>
  | Promise<unknown[]>
  | Promise<AsyncIterable<unknown>>;

interface WindowProviderApi {
  streamTurn?: (args: ProviderStreamTurnArgs) => ProviderStreamTurnResult;
  startStreamTurn?: (args: ProviderStreamTurnArgs) => Promise<{ ok: boolean; streamId: string }>;
  startPushTurn?: (args: ProviderStreamTurnArgs) => Promise<{ ok: boolean; streamId: string; turnId: string | null }>;
  readStreamTurn?: (args: { streamId: string; cursor: number }) => Promise<{
    ok: boolean;
    events: unknown[];
    cursor: number;
    done: boolean;
    message?: string;
  }>;
  subscribeStreamEvents?: (listener: (payload: {
    streamId: string;
    event: unknown;
    sequence: number;
    done: boolean;
    taskId: string | null;
    workspaceId: string | null;
    providerId: ProviderId;
    turnId: string | null;
  }) => void) => () => void;
  abortTurn?: (args: { turnId: string }) => Promise<{ ok: boolean; message?: string }>;
  cleanupTask?: (args: { taskId: string }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: { turnId: string; requestId: string; approved: boolean }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  respondUserInput?: (args: {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  checkAvailability?: (args: { providerId: ProviderId }) => Promise<{
    ok: boolean;
    available: boolean;
    detail: string;
  }>;
  getCommandCatalog?: (args: {
    providerId: ProviderId;
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<{
    ok: boolean;
    supported: boolean;
    commands: ProviderSlashCommand[];
    detail: string;
  }>;
}

interface WindowFsApi {
  pickRoot?: () => Promise<{ ok: boolean; rootPath?: string; rootName?: string; files: string[]; stderr?: string }>;
  resolvePath?: (args: { inputPath: string }) => Promise<{ ok: boolean; rootPath?: string; rootName?: string; files?: string[]; stderr?: string }>;
  listFiles?: (args: { rootPath: string }) => Promise<{ ok: boolean; files: string[]; stderr?: string }>;
  listDirectory?: (args: { rootPath: string; directoryPath?: string }) => Promise<{
    ok: boolean;
    entries: Array<{
      name: string;
      path: string;
      type: "file" | "folder";
    }>;
    stderr?: string;
  }>;
  readFile?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    content: string;
    revision: string;
    stderr?: string;
  }>;
  readFileDataUrl?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    dataUrl: string;
    revision: string;
    stderr?: string;
  }>;
  writeFile?: (args: { rootPath: string; filePath: string; content: string; expectedRevision?: string | null }) => Promise<{
    ok: boolean;
    revision?: string;
    conflict?: boolean;
    stderr?: string;
  }>;
  readTypeDefs?: (args: { rootPath: string; entryFilePath?: string }) => Promise<{
    ok: boolean;
    libs: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
  readSourceFiles?: (args: { rootPath: string; entryFilePath?: string }) => Promise<{
    ok: boolean;
    files: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
}

interface WindowSkillsApi {
  getCatalog?: (args?: { workspacePath?: string }) => Promise<SkillCatalogResponse>;
}

type LspLanguageId = "python";

interface WindowLspApi {
  syncDocument?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    documentLanguageId: string;
    text: string;
    version: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  closeDocument?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  hover?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    line: number;
    character: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  completion?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    line: number;
    character: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  definition?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    line: number;
    character: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  stopSessions?: (args: { rootPath?: string }) => Promise<{ ok: boolean }>;
  subscribeEvents?: (listener: (payload:
    | {
        type: "status";
        rootPath: string;
        languageId: LspLanguageId;
        status?: "starting" | "ready" | "error" | "unavailable" | "stopped";
        detail?: string;
      }
    | {
        type: "diagnostics";
        rootPath: string;
        languageId: LspLanguageId;
        filePath?: string;
        diagnostics?: Array<{
          severity?: number;
          message: string;
          source?: string;
          code?: string;
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
        }>;
      }
  ) => void) => () => void;
}

interface TerminalRunArgs {
  command: string;
  cwd?: string;
}

interface TerminalRunResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface WindowTerminalApi {
  runCommand?: (args: TerminalRunArgs) => Promise<TerminalRunResult>;
  createSession?: (args: { cwd?: string; shell?: string; cols?: number; rows?: number }) => Promise<{ ok: boolean; sessionId?: string }>;
  writeSession?: (args: { sessionId: string; input: string }) => Promise<{ ok: boolean; stderr?: string }>;
  readSession?: (args: { sessionId: string }) => Promise<{ ok: boolean; output: string; stderr?: string }>;
  resizeSession?: (args: { sessionId: string; cols: number; rows: number }) => Promise<{ ok: boolean; stderr?: string }>;
  closeSession?: (args: { sessionId: string }) => Promise<{ ok: boolean; stderr?: string }>;
}

interface SourceControlStatusItem {
  code: string;
  path: string;
}

interface SourceControlStatusResult {
  ok: boolean;
  branch: string;
  items: SourceControlStatusItem[];
  hasConflicts: boolean;
  stderr: string;
}

interface SourceControlCommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface WindowSourceControlApi {
  getStatus?: (args: { cwd?: string }) => Promise<SourceControlStatusResult>;
  stageAll?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  unstageAll?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  commit?: (args: { message: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  stageFile?: (args: { path: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  unstageFile?: (args: { path: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  discardFile?: (args: { path: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  getDiff?: (args: { path: string; cwd?: string }) => Promise<{
    ok: boolean;
    content: string;
    oldContent?: string;
    newContent?: string;
    stderr: string;
  }>;
  getHistory?: (args: { cwd?: string; limit?: number }) => Promise<{
    ok: boolean;
    items: Array<{ hash: string; relativeDate: string; subject: string }>;
    stderr: string;
  }>;
  listBranches?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    current: string;
    branches: string[];
    worktreePathByBranch: Record<string, string>;
    stderr: string;
  }>;
  createBranch?: (args: { name: string; cwd?: string; from?: string }) => Promise<SourceControlCommandResult>;
  checkoutBranch?: (args: { name: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  mergeBranch?: (args: { branch: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  rebaseBranch?: (args: { branch: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  cherryPick?: (args: { commit: string; cwd?: string }) => Promise<SourceControlCommandResult>;
}

interface WindowPersistenceApi {
  listWorkspaces?: () => Promise<{
    ok: boolean;
    rows: Array<{ id: string; name: string; updatedAt: string }>;
  }>;
  loadWorkspace?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<string, Array<{
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
      }>>;
      promptDraftByTask?: Record<string, {
        text: string;
        attachedFilePaths?: string[];
      }>;
      providerConversationByTask?: Record<string, {
        "claude-code"?: string;
        codex?: string;
      }>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        hasConflict: boolean;
        isDirty: boolean;
      }>;
      activeEditorTabId?: string | null;
    } | null;
  }>;
  upsertWorkspace?: (args: {
    id: string;
    name: string;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<string, Array<{
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
      }>>;
      promptDraftByTask?: Record<string, {
        text: string;
        attachedFilePaths?: string[];
      }>;
      providerConversationByTask?: Record<string, {
        "claude-code"?: string;
        codex?: string;
      }>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        hasConflict: boolean;
        isDirty: boolean;
      }>;
      activeEditorTabId?: string | null;
    };
  }) => Promise<{ ok: boolean }>;
  deleteWorkspace?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  listTaskTurns?: (args: { workspaceId: string; taskId: string; limit?: number }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
      eventCount: number;
    }>;
  }>;
  listLatestWorkspaceTurns?: (args: { workspaceId: string; limit?: number }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
      eventCount: number;
    }>;
  }>;
  upsertWorkspaceSync?: (args: {
    id: string;
    name: string;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<string, Array<{
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
      }>>;
      promptDraftByTask?: Record<string, {
        text: string;
        attachedFilePaths?: string[];
      }>;
      providerConversationByTask?: Record<string, {
        "claude-code"?: string;
        codex?: string;
      }>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        hasConflict: boolean;
        isDirty: boolean;
      }>;
      activeEditorTabId?: string | null;
    };
  }) => { ok: boolean };
  listTurnEvents?: (args: { turnId: string; afterSequence?: number; limit?: number }) => Promise<{
    ok: boolean;
    events: Array<{
      id: string;
      turnId: string;
      sequence: number;
      eventType: string;
      payload: unknown;
      createdAt: string;
    }>;
  }>;
}

interface WindowCaptureApi {
  screenshot: () => Promise<{ ok: boolean; dataUrl: string }>;
}

interface WindowApi {
  provider?: WindowProviderApi;
  persistence?: WindowPersistenceApi;
  fs?: WindowFsApi;
  skills?: WindowSkillsApi;
  lsp?: WindowLspApi;
  terminal?: WindowTerminalApi;
  sourceControl?: WindowSourceControlApi;
  capture?: WindowCaptureApi;
  window?: {
    minimize?: () => Promise<void>;
    toggleMaximize?: () => Promise<{ isMaximized: boolean }>;
    close?: () => Promise<void>;
    isMaximized?: () => Promise<{ isMaximized: boolean }>;
    getGpuStatus?: () => Promise<{
      hardwareAccelerationEnabled: boolean;
      featureStatus: Record<string, string>;
    }>;
    subscribeZoomChanges?: (listener: (payload: { factor: number; percent: number }) => void) => () => void;
    subscribeCloseShortcut?: (listener: () => void) => () => void;
  };
  shell?: {
    openExternal?: (args: { url: string }) => Promise<{ ok: boolean; stderr?: string }>;
  };
}

declare global {
  interface Window {
    api?: WindowApi;
  }
}

export {};
