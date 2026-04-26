import type {
  CodexAppServerSnapshotResponse,
  CodexModelCatalogResponse,
  CodexMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
  CanonicalConversationRequest,
  ClaudeContextUsageResponse,
  CodexMcpStatusResponse,
  ClaudePluginReloadResponse,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginInstallResponse,
  ProviderId,
  ProviderRuntimeOptions,
  CodexReviewStartResponse,
} from "@/lib/providers/provider.types";
import type {
  ConnectedToolId,
  ConnectedToolStatusResponse,
} from "@/lib/providers/connected-tool-status";
import type {
  StaveLocalMcpRequestLog,
  StaveLocalMcpRequestLogQuery,
  StaveLocalMcpStatus,
} from "@/lib/local-mcp";
import type { RepoMapResponse } from "@/lib/fs/repo-map.types";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import type { ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";
import type { GitHubPrPayload } from "@/lib/pr-status";
import type { SkillCatalogResponse } from "@/lib/skills/types";
import type {
  CliSessionCreateSessionArgs,
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  TerminalCreateSessionArgs,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { PromptDraft } from "@/types/chat";
import type {
  AppUpdateInstallResult,
  AppUpdateStatusSnapshot,
} from "@/lib/app-update";
import type {
  SyncOriginMainResult,
  ToolingStatusRequest,
  ToolingStatusSnapshot,
} from "@/lib/tooling-status";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptHookRunSummary,
  WorkspaceScriptStatusEntry,
} from "@/lib/workspace-scripts/types";
import type { PersistenceBootstrapStatus } from "@/lib/persistence/bootstrap-status";

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
  startStreamTurn?: (
    args: ProviderStreamTurnArgs,
  ) => Promise<{ ok: boolean; streamId: string; message?: string }>;
  startPushTurn?: (args: ProviderStreamTurnArgs) => Promise<{
    ok: boolean;
    streamId: string;
    turnId: string | null;
    message?: string;
  }>;
  readStreamTurn?: (args: { streamId: string; cursor: number }) => Promise<{
    ok: boolean;
    events: unknown[];
    cursor: number;
    done: boolean;
    message?: string;
  }>;
  ackStreamTurn?: (args: { streamId: string; cursor: number }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  subscribeStreamEvents?: (
    listener: (payload: {
      streamId: string;
      event: unknown;
      sequence: number;
      done: boolean;
      taskId: string | null;
      workspaceId: string | null;
      providerId: ProviderId;
      turnId: string | null;
    }) => void,
  ) => () => void;
  abortTurn?: (args: {
    turnId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  cleanupTask?: (args: {
    taskId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: {
    turnId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{
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
  checkAvailability?: (args: {
    providerId: ProviderId;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<{
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
  getConnectedToolStatus?: (args: {
    providerId: ProviderId;
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
    toolIds?: ConnectedToolId[];
  }) => Promise<ConnectedToolStatusResponse>;
  getClaudeContextUsage?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudeContextUsageResponse>;
  reloadClaudePlugins?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudePluginReloadResponse>;
  getCodexMcpStatus?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMcpStatusResponse>;
  getCodexModelCatalog?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexModelCatalogResponse>;
  getCodexAppServerSnapshot?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexAppServerSnapshotResponse>;
  getCodexPluginDetail?: (args: {
    marketplacePath: string;
    pluginName: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexPluginDetailResponse>;
  installCodexPlugin?: (args: {
    marketplacePath: string;
    pluginName: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexPluginInstallResponse>;
  uninstallCodexPlugin?: (args: {
    pluginId: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  setCodexExperimentalFeatureEnablement?: (args: {
    enablement: Record<string, boolean>;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  startCodexMcpOauthLogin?: (args: {
    name: string;
    scopes?: string[];
    timeoutSecs?: number;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMcpOauthLoginResponse>;
  readCodexMcpResource?: (args: {
    threadId: string;
    server: string;
    uri: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMcpResourceReadResponse>;
  renameCodexThread?: (args: {
    threadId: string;
    name: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  readCodexThread?: (args: {
    threadId: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexThreadReadResponse>;
  forkCodexThread?: (args: {
    threadId: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexThreadForkResponse>;
  archiveCodexThread?: (args: {
    threadId: string;
    archived?: boolean;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  compactCodexThread?: (args: {
    threadId: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  rollbackCodexThread?: (args: {
    threadId: string;
    numTurns: number;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  startCodexReview?: (args: {
    threadId: string;
    delivery?: "inline" | "detached";
    target:
      | { type: "uncommittedChanges" }
      | { type: "baseBranch"; baseBranch: string }
      | { type: "commit"; sha: string; title?: string }
      | { type: "custom"; instructions: string };
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexReviewStartResponse>;
  importCodexExternalConfig?: (args: {
    migrationItems: Array<{
      itemType: string;
      description: string;
      cwd: string | null;
    }>;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  writeCodexConfigValue?: (args: {
    keyPath: string;
    value: unknown;
    mergeStrategy?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  batchWriteCodexConfig?: (args: {
    edits: Array<{
      keyPath: string;
      value: unknown;
      mergeStrategy?: string;
    }>;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMutationResponse>;
  /** Generates a short task title from the given prompt and optional
   *  conversation history using a lightweight single-turn Claude query
   *  isolated from the main task conversation. */
  suggestTaskName?: (args: {
    prompt: string;
    history?: Array<{ role: string; content: string }>;
  }) => Promise<{ ok: boolean; title?: string }>;
  /** Generates a conventional commit message from the current git diff in the
   *  given working directory using a lightweight single-turn Claude query. */
  suggestCommitMessage?: (args: {
    cwd?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  /** Generates a PR title and description from the branch diff and commit log
   *  using a lightweight single-turn Claude query. */
  suggestPRDescription?: (args: {
    cwd?: string;
    baseBranch?: string;
    /** Workspace branch from the store — used as the authoritative branch
     *  name and for cwd validation on the main-process side. */
    headBranch?: string;
    promptTemplate?: string;
    workspaceContext?: string;
  }) => Promise<{
    ok: boolean;
    title?: string;
    body?: string;
    headBranch?: string;
  }>;
}

interface WindowFsApi {
  pickRoot?: () => Promise<{
    ok: boolean;
    rootPath?: string;
    rootName?: string;
    files: string[];
    stderr?: string;
  }>;
  pickFiles?: (args: { rootPath: string }) => Promise<{
    ok: boolean;
    filePaths: string[];
    stderr?: string;
  }>;
  resolvePath?: (args: { inputPath: string }) => Promise<{
    ok: boolean;
    rootPath?: string;
    rootName?: string;
    files?: string[];
    stderr?: string;
  }>;
  listFiles?: (args: {
    rootPath: string;
  }) => Promise<{ ok: boolean; files: string[]; stderr?: string }>;
  getRepoMap?: (args: {
    rootPath: string;
    refresh?: boolean;
  }) => Promise<RepoMapResponse>;
  listDirectory?: (args: {
    rootPath: string;
    directoryPath?: string;
  }) => Promise<{
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
  writeFile?: (args: {
    rootPath: string;
    filePath: string;
    content: string;
    expectedRevision?: string | null;
  }) => Promise<{
    ok: boolean;
    revision?: string;
    conflict?: boolean;
    stderr?: string;
  }>;
  createFile?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    revision?: string;
    alreadyExists?: boolean;
    stderr?: string;
  }>;
  createDirectory?: (args: {
    rootPath: string;
    directoryPath: string;
  }) => Promise<{
    ok: boolean;
    alreadyExists?: boolean;
    stderr?: string;
  }>;
  deleteFile?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    stderr?: string;
  }>;
  deleteDirectory?: (args: {
    rootPath: string;
    directoryPath: string;
  }) => Promise<{
    ok: boolean;
    stderr?: string;
  }>;
  readTypeDefs?: (args: {
    rootPath: string;
    entryFilePath?: string;
  }) => Promise<{
    ok: boolean;
    libs: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
  readSourceFiles?: (args: {
    rootPath: string;
    entryFilePath?: string;
  }) => Promise<{
    ok: boolean;
    files: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
  searchContent?: (args: { rootPath: string; query: string }) => Promise<{
    ok: boolean;
    results: Array<{
      file: string;
      matches: Array<{ line: number; text: string }>;
    }>;
    limitHit: boolean;
    stderr?: string;
  }>;
}

interface WindowSkillsApi {
  getCatalog?: (args?: {
    workspacePath?: string;
    sharedSkillsHome?: string;
  }) => Promise<SkillCatalogResponse>;
}

interface WindowLocalMcpApi {
  getStatus?: () => Promise<{
    ok: boolean;
    status: StaveLocalMcpStatus | null;
    message?: string;
  }>;
  updateConfig?: (args: {
    enabled?: boolean;
    port?: number;
    token?: string;
    claudeCodeAutoRegister?: boolean;
    codexAutoRegister?: boolean;
  }) => Promise<{
    ok: boolean;
    status: StaveLocalMcpStatus | null;
    message?: string;
  }>;
  rotateToken?: () => Promise<{
    ok: boolean;
    status: StaveLocalMcpStatus | null;
    message?: string;
  }>;
  listRequestLogs?: (args?: StaveLocalMcpRequestLogQuery) => Promise<{
    ok: boolean;
    logs: StaveLocalMcpRequestLog[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    message?: string;
  }>;
  getRequestLog?: (args: { id: string; includePayload?: boolean }) => Promise<{
    ok: boolean;
    log: StaveLocalMcpRequestLog | null;
    message?: string;
  }>;
  clearRequestLogs?: () => Promise<{
    ok: boolean;
    cleared: number;
    message?: string;
  }>;
  respondApproval?: (args: {
    workspaceId: string;
    taskId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
    result?: {
      ok: boolean;
      workspaceId: string;
      taskId: string;
      requestId: string;
      approved: boolean;
    };
  }>;
  respondUserInput?: (args: {
    workspaceId: string;
    taskId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
    result?: {
      ok: boolean;
      workspaceId: string;
      taskId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    };
  }>;
  subscribeWorkspaceInformationUpdates?: (
    listener: (payload: {
      workspaceId: string;
      workspaceInformation: WorkspaceInformationState;
    }) => void,
  ) => () => void;
}

type LspLanguageId = "python" | "typescript";

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
  subscribeEvents?: (
    listener: (
      payload:
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
          },
    ) => void,
  ) => () => void;
}

interface EslintRequestArgs {
  rootPath: string;
  filePath: string;
  text: string;
}

interface EslintDiagnostic {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

interface EslintResult {
  ok: boolean;
  diagnostics?: EslintDiagnostic[];
  output?: string;
  detail?: string;
}

interface WindowEslintApi {
  lint?: (args: EslintRequestArgs) => Promise<EslintResult>;
  fix?: (args: EslintRequestArgs) => Promise<EslintResult>;
}

interface WindowDiagnosticsApi {
  reportRendererIssue?: (args: {
    scope: string;
    context: string;
    message: string;
    stack?: string;
    metadata?: Record<string, string>;
  }) => Promise<{ ok: boolean; stderr?: string }>;
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

interface TerminalSessionOutputPayload {
  sessionId: string;
  output: string;
}

interface TerminalSessionExitPayload {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

interface WindowTerminalApi {
  runCommand?: (args: TerminalRunArgs) => Promise<TerminalRunResult>;
  createSession?: (
    args: TerminalCreateSessionArgs,
  ) => Promise<{ ok: boolean; sessionId?: string }>;
  createCliSession?: (args: CliSessionCreateSessionArgs) => Promise<{
    ok: boolean;
    sessionId?: string;
    nativeSessionId?: string;
    stderr?: string;
  }>;
  writeSession?: (args: {
    sessionId: string;
    input: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  readSession?: (args: {
    sessionId: string;
  }) => Promise<{ ok: boolean; output: string; stderr?: string }>;
  subscribeSessionOutput?: (
    listener: (payload: TerminalSessionOutputPayload) => void,
  ) => () => void;
  subscribeSessionExit?: (
    listener: (payload: TerminalSessionExitPayload) => void,
  ) => () => void;
  setSessionDeliveryMode?: (args: {
    sessionId: string;
    deliveryMode: "poll" | "push";
  }) => Promise<{ ok: boolean; stderr?: string }>;
  resizeSession?: (args: {
    sessionId: string;
    cols: number;
    rows: number;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  closeSession?: (args: {
    sessionId: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  attachSession?: (args: {
    sessionId: string;
    deliveryMode: "poll" | "push";
  }) => Promise<{
    ok: boolean;
    attachmentId?: string;
    backlog?: string;
    screenState?: string;
    stderr?: string;
  }>;
  detachSession?: (args: {
    sessionId: string;
    attachmentId?: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  resumeSessionStream?: (args: {
    sessionId: string;
    attachmentId: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  getSlotState?: (args: { slotKey: string }) => Promise<{
    state: "idle" | "running" | "background" | "exited";
    sessionId?: string;
    exitCode?: number;
    signal?: number;
  }>;
  getSessionResumeInfo?: (args: { sessionId: string }) => Promise<{
    ok: boolean;
    nativeSessionId?: string;
    stderr?: string;
  }>;
  closeSessionsBySlotPrefix?: (args: {
    prefix: string;
  }) => Promise<{ ok: boolean; closedCount: number }>;
}

interface WindowToolingApi {
  getStatus?: (args: ToolingStatusRequest) => Promise<ToolingStatusSnapshot>;
  syncOriginMain?: (args: { cwd?: string }) => Promise<SyncOriginMainResult>;
  getAppUpdateStatus?: () => Promise<AppUpdateStatusSnapshot>;
  installAppUpdateAndRestart?: () => Promise<AppUpdateInstallResult>;
}

interface WindowScriptsApi {
  getConfig?: (args: {
    projectPath: string;
    workspacePath: string;
    userOverridePath?: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    config: ResolvedWorkspaceScriptsConfig | null;
  }>;
  getStatus?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    error?: string;
    statuses: WorkspaceScriptStatusEntry[];
  }>;
  runEntry?: (args: {
    workspaceId: string;
    scriptId: string;
    scriptKind: ScriptKind;
    projectPath: string;
    workspacePath: string;
    workspaceName: string;
    branch: string;
  }) => Promise<{
    ok: boolean;
    runId?: string;
    sessionId?: string;
    exitCode?: number;
    alreadyRunning?: boolean;
    error?: string;
  }>;
  stopEntry?: (args: {
    workspaceId: string;
    scriptId: string;
    scriptKind: ScriptKind;
  }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  runHook?: (args: {
    workspaceId: string;
    trigger: ScriptTrigger;
    projectPath: string;
    workspacePath: string;
    workspaceName: string;
    branch: string;
    taskId?: string;
    taskTitle?: string;
    turnId?: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    summary: WorkspaceScriptHookRunSummary | null;
  }>;
  stopAll?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  subscribeEvents?: (
    args: { workspaceId: string },
    listener: (payload: WorkspaceScriptEventEnvelope) => void,
  ) => () => void;
}

interface SourceControlStatusItem {
  code: string;
  path: string;
  indexStatus?: string;
  workingTreeStatus?: string;
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
  commit?: (args: {
    message: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  tryAutoFixLint?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    fixAttempted: boolean;
    eslintOk?: boolean;
    prettierOk?: boolean;
    stderr: string;
  }>;
  stageFile?: (args: {
    path: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  unstageFile?: (args: {
    path: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  discardFile?: (args: {
    path: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
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
  listBranches?: (args: { cwd?: string; refreshRemote?: boolean }) => Promise<{
    ok: boolean;
    current: string;
    branches: string[];
    remoteBranches: string[];
    worktreePathByBranch: Record<string, string>;
    stderr: string;
  }>;
  createBranch?: (args: {
    name: string;
    cwd?: string;
    from?: string;
  }) => Promise<SourceControlCommandResult>;
  checkoutBranch?: (args: {
    name: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  mergeBranch?: (args: {
    branch: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  rebaseBranch?: (args: {
    branch: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  cherryPick?: (args: {
    commit: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  createPR?: (args: {
    title: string;
    body?: string;
    baseBranch?: string;
    draft?: boolean;
    cwd?: string;
  }) => Promise<{ ok: boolean; prUrl?: string; stderr?: string }>;
  getPrStatus?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    pr: GitHubPrPayload | null;
    stderr?: string;
  }>;
  getPrStatusForUrl?: (args: { url: string; cwd?: string }) => Promise<{
    ok: boolean;
    pr: GitHubPrPayload | null;
    stderr?: string;
  }>;
  setPrReady?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  mergePr?: (args: {
    method?: "merge" | "squash" | "rebase";
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  updatePrBranch?: (args: {
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
}

interface WindowPersistenceApi {
  getBootstrapStatus?: () => Promise<PersistenceBootstrapStatus>;
  subscribeBootstrapStatus?: (
    listener: (payload: PersistenceBootstrapStatus) => void,
  ) => () => void;
  listWorkspaces?: () => Promise<{
    ok: boolean;
    rows: Array<{ id: string; name: string; updatedAt: string }>;
  }>;
  loadWorkspaceShell?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shell: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
      }>;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
          stave?: string;
        }
      >;
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
    } | null;
  }>;
  loadWorkspaceShellForRestore?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shell: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
      }>;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
          stave?: string;
        }
      >;
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
    } | null;
  }>;
  loadWorkspaceShellLite?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shellLite: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
      }>;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
          stave?: string;
        }
      >;
      messageCountByTask?: Record<string, number>;
    } | null;
  }>;
  loadWorkspaceShellSummary?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    summary: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
      }>;
      messageCountByTask?: Record<string, number>;
      terminalTabCount?: number;
      cliSessionTabCount?: number;
    } | null;
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
      messagesByTask: Record<
        string,
        Array<{
          id: string;
          role: "user" | "assistant";
          model: string;
          providerId: string;
          content: string;
          startedAt?: string;
          completedAt?: string;
          isStreaming?: boolean;
          usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheCreationTokens?: number;
            totalCostUsd?: number;
            ttftMs?: number;
          };
          promptSuggestions?: string[];
          parts: unknown[];
        }>
      >;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
        }
      >;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
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
    } | null;
  }>;
  loadTaskMessages?: (args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }) => Promise<{
    ok: boolean;
    page: {
      messages: Array<{
        id: string;
        role: "user" | "assistant";
        model: string;
        providerId: string;
        content: string;
        startedAt?: string;
        completedAt?: string;
        isStreaming?: boolean;
        usage?: {
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens?: number;
          cacheCreationTokens?: number;
          totalCostUsd?: number;
          ttftMs?: number;
        };
        promptSuggestions?: string[];
        parts: unknown[];
      }>;
      totalCount: number;
      limit: number;
      offset: number;
      hasMoreOlder: boolean;
    } | null;
  }>;
  loadWorkspaceEditorTabBodies?: (args: {
    workspaceId: string;
    tabIds: string[];
  }) => Promise<{
    ok: boolean;
    bodies: Array<{
      id: string;
      content: string;
      originalContent?: string;
      savedContent?: string;
    }>;
  }>;
  loadProjectRegistry?: () => Promise<{
    ok: boolean;
    projects: unknown[];
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
      messagesByTask: Record<
        string,
        Array<{
          id: string;
          role: "user" | "assistant";
          model: string;
          providerId: string;
          content: string;
          startedAt?: string;
          completedAt?: string;
          isStreaming?: boolean;
          usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheCreationTokens?: number;
            totalCostUsd?: number;
            ttftMs?: number;
          };
          promptSuggestions?: string[];
          parts: unknown[];
        }>
      >;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
        }
      >;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
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
    };
  }) => Promise<{ ok: boolean }>;
  saveProjectRegistry?: (args: {
    projects: unknown[];
  }) => Promise<{ ok: boolean }>;
  closeWorkspace?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  listNotifications?: (args?: {
    limit?: number;
    unreadOnly?: boolean;
  }) => Promise<{
    ok: boolean;
    notifications: AppNotification[];
  }>;
  createNotification?: (args: {
    notification: AppNotificationCreateInput;
  }) => Promise<{
    ok: boolean;
    inserted: boolean;
    notification: AppNotification | null;
  }>;
  markNotificationRead?: (args: { id: string; readAt?: string }) => Promise<{
    ok: boolean;
    notification: AppNotification | null;
  }>;
  markAllNotificationsRead?: (args?: { readAt?: string }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  listTaskTurns?: (args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
    }>;
  }>;
  listActiveWorkspaceTurns?: (args: {
    workspaceId: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
    }>;
  }>;
  listLatestWorkspaceTurns?: (args: {
    workspaceId: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
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
      messagesByTask: Record<
        string,
        Array<{
          id: string;
          role: "user" | "assistant";
          model: string;
          providerId: string;
          content: string;
          startedAt?: string;
          completedAt?: string;
          isStreaming?: boolean;
          usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheCreationTokens?: number;
            totalCostUsd?: number;
            ttftMs?: number;
          };
          promptSuggestions?: string[];
          parts: unknown[];
        }>
      >;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
        }
      >;
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
      terminalTabs?: WorkspaceTerminalTab[];
      activeTerminalTabId?: string | null;
      terminalDocked?: boolean;
      workspaceInformation?: WorkspaceInformationState;
    };
  }) => { ok: boolean };
}

interface AppMetricsResult {
  processes: Array<{
    pid: number;
    type: string;
    memory: {
      workingSetSizeKB: number;
      peakWorkingSetSizeKB: number;
    };
    cpu: {
      percentCPUUsage: number;
    };
  }>;
  mainProcess: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  uptimeSeconds: number;
}

interface WindowMetricsApi {
  getAppMetrics?: () => Promise<AppMetricsResult>;
}

interface LensNavigationState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

interface LensNavigationEventPayload {
  workspaceId: string;
  state: LensNavigationState;
}

interface LensElementPickerResult {
  selector: string;
  tagName: string;
  id: string;
  classList: string[];
  boundingBox: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  outerHTML: string;
  textContent: string;
  debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
}

interface WindowLensApi {
  createView?: (args: {
    workspaceId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  destroyView?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  setBounds?: (args: {
    workspaceId: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => Promise<{ ok: boolean; message?: string }>;
  setVisible?: (args: {
    workspaceId: string;
    visible: boolean;
  }) => Promise<{ ok: boolean }>;
  navigate?: (args: {
    workspaceId: string;
    url: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  goBack?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  goForward?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  reload?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  getState?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    state?: LensNavigationState;
    message?: string;
  }>;
  screenshot?: (args: {
    workspaceId: string;
    options?: {
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
    };
  }) => Promise<{ ok: boolean; dataUrl?: string; message?: string }>;
  getDom?: (args: {
    workspaceId: string;
    selector?: string;
  }) => Promise<{ ok: boolean; html?: string; message?: string }>;
  evaluate?: (args: {
    workspaceId: string;
    expression: string;
  }) => Promise<{ ok: boolean; result?: unknown; message?: string }>;
  getConsoleLog?: (args: { workspaceId: string; limit?: number }) => Promise<{
    ok: boolean;
    entries?: Array<{
      level: string;
      text: string;
      timestamp: string;
      source?: string;
    }>;
    message?: string;
  }>;
  getNetworkLog?: (args: { workspaceId: string; limit?: number }) => Promise<{
    ok: boolean;
    entries?: Array<{
      url: string;
      method: string;
      status?: number;
      timestamp: string;
    }>;
    message?: string;
  }>;
  startElementPicker?: (args: {
    workspaceId: string;
    options?: { extractDebugSource?: boolean };
  }) => Promise<{
    ok: boolean;
    result?: LensElementPickerResult;
    message?: string;
  }>;
  subscribeNavigationEvents?: (
    listener: (payload: LensNavigationEventPayload) => void,
  ) => () => void;
}

interface WindowInlineCompletionApi {
  request?: (args: {
    prefix: string;
    suffix: string;
    filePath: string;
    language: string;
    maxTokens?: number;
    systemPromptOverride?: string;
  }) => Promise<{ ok: boolean; text: string; error?: string }>;
  abort?: () => Promise<{ ok: boolean }>;
  available?: () => Promise<{ ok: boolean; available: boolean }>;
}

interface WindowApi {
  platform?: NodeJS.Platform;
  provider?: WindowProviderApi;
  persistence?: WindowPersistenceApi;
  fs?: WindowFsApi;
  skills?: WindowSkillsApi;
  localMcp?: WindowLocalMcpApi;
  lsp?: WindowLspApi;
  eslint?: WindowEslintApi;
  diagnostics?: WindowDiagnosticsApi;
  terminal?: WindowTerminalApi;
  tooling?: WindowToolingApi;
  scripts?: WindowScriptsApi;
  sourceControl?: WindowSourceControlApi;
  metrics?: WindowMetricsApi;
  inlineCompletion?: WindowInlineCompletionApi;
  lens?: WindowLensApi;
  window?: {
    minimize?: () => Promise<void>;
    toggleMaximize?: () => Promise<{ isMaximized: boolean }>;
    close?: () => Promise<void>;
    confirmAppQuit?: () => Promise<{ ok: boolean }>;
    cancelAppQuit?: () => Promise<{ ok: boolean }>;
    isMaximized?: () => Promise<{ isMaximized: boolean }>;
    getGpuStatus?: () => Promise<{
      hardwareAccelerationEnabled: boolean;
      featureStatus: Record<string, string>;
    }>;
    subscribeZoomChanges?: (
      listener: (payload: { factor: number; percent: number }) => void,
    ) => () => void;
    subscribeCloseShortcut?: (listener: () => void) => () => void;
    subscribeAppQuitRequested?: (listener: () => void) => () => void;
  };
  shell?: {
    openExternal?: (args: {
      url: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    showInFinder?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    openInVSCode?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    openInTerminal?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    openInGhostty?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
  };
}

declare global {
  interface Window {
    api?: WindowApi;
  }
}

export {};
