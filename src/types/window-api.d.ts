import type {
  CodexAppServerSnapshotResponse,
  CodexModelCatalogResponse,
  CodexMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
  CanonicalConversationRequest,
  ClaudeContextUsageResponse,
  ClaudeFileRewindResponse,
  ClaudeMcpOauthLoginResponse,
  ClaudeMcpStatusResponse,
  ClaudeSessionForkResponse,
  ProviderMutationResponse,
  CodexMcpStatusResponse,
  McpDiscoveryResponse,
  ClaudePluginReloadResponse,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginInstallResponse,
  ProviderId,
  ProviderAvailabilityResponse,
  ProviderRuntimeOptions,
  ProviderSteerTurnRequest,
  ProviderSteerTurnResponse,
  CodexReviewStartResponse,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import type {
  RouteClassification,
  UtilityInferenceContext,
  UtilityInferenceMetadata,
} from "@/lib/providers/utility-inference";
import type {
  McpServerConfigListRequest,
  McpServerConfigListResponse,
  McpServerConfigMutationApplyRequest,
  McpServerConfigMutationPreviewResponse,
  McpServerConfigMutationRequest,
  McpServerConfigMutationResponse,
} from "@/lib/providers/mcp-config.types";
import type {
  ConnectedToolId,
  ConnectedToolStatusResponse,
} from "@/lib/providers/connected-tool-status";
import type {
  StaveLocalMcpRequestLog,
  StaveLocalMcpRequestLogQuery,
  StaveLocalMcpStatus,
} from "@/lib/local-mcp";
import type { LocalMcpTaskTurnUpdate } from "@/lib/local-mcp/task-turn-update";
import type {
  CraneConnectorConfigInput,
  CraneConnectorPairInput,
  CraneConnectorPublicStatus,
  CraneDispatchApprovalRequest,
  CraneDispatchApprovalResponse,
  CraneDispatchJobUpdate,
} from "@/lib/crane-connector/types";
import type {
  AtelierConnectorPairInput,
  AtelierConnectorPublicStatus,
} from "@/lib/atelier-connector/types";
import type { MartinProjectSummary } from "@/lib/martin-sync/contract";
import type {
  MartinLinkProjectArgs,
  MartinListProjectsArgs,
  MartinSyncEnqueueArgs,
  MartinSyncLinksChangedArgs,
  MartinSyncMappingStalePayload,
  MartinSyncPublicStatus,
  MartinSyncSettings,
  MartinWorkspaceArgs,
} from "@/lib/martin-sync/types";
import type { RepoMapResponse } from "@/lib/fs/repo-map.types";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import type {
  PrePrReviewFinding,
  PrePrReviewProviderId,
} from "@/lib/source-control-review";
import type { ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";
import type { GitHubPrPayload } from "@/lib/pr-status";
import type { PrCheckLogExcerpt, PrContextIndex } from "@/lib/pr-context";
import type { SkillCatalogResponse } from "@/lib/skills/types";
import type {
  CliSessionCreateSessionArgs,
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  TerminalCreateSessionArgs,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type {
  WorkspaceMartinProjectLink,
  WorkspaceInformationState,
} from "@/lib/workspace-information";
import type {
  RoutineInformationResourceCreateInput,
  RoutineRun,
  RoutineSnapshot,
  RoutineSpec,
  RoutineUpsertInput,
} from "@/lib/routines";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import type { PromptDraft } from "@/types/chat";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type {
  AppUpdateInstallResult,
  AppUpdateStatusSnapshot,
} from "@/lib/app-update";
import type {
  LensCredentialMetadata,
  LensCredentialUpsertInput,
} from "@/lib/lens/lens-credentials";
import type { SecretMetadata, SecretUpsertInput } from "@/lib/secrets/secrets";
import type {
  BrowserConsoleEntry as LensConsoleEntry,
  BrowserConsoleEntryDetail,
  BrowserConsoleEventPayload as LensConsoleEventPayload,
  BrowserConsoleObjectProperties,
  BrowserNetworkBody,
  BrowserNetworkEntry as LensNetworkEntry,
  BrowserNetworkEntryDetail,
  BrowserNetworkEventPayload as LensNetworkEventPayload,
  LensDiagnosticsCaptureState,
} from "@/lib/lens/lens.types";
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
import type {
  GraphCommitDetailsResult,
  GraphFileChange,
  GraphResult,
} from "@/lib/git-graph/types";
import type {
  LensGuestFocusRequestPayload,
  LensGuestFocusResultPayload,
  LensGuestRequiredPayload,
  LensSessionClosedPayload,
  LensSessionPresentationRequestPayload,
} from "@/lib/lens/lens.types";
import type {
  SecondaryRunAggregate,
  SecondaryRunCancelArgs,
  SecondaryRunClaimArgs,
  SecondaryRunCompleteArgs,
  SecondaryRunExecuteArgs,
  SecondaryRunExecuteResponse,
  SecondaryRunFailArgs,
  SecondaryRunLookupArgs,
  SecondaryRunReceiptList,
  SecondaryRunReceiptListArgs,
  SecondaryRunTransitionResponse,
} from "@/lib/runs/secondary-run";
import type {
  ChildTaskActionResponse,
  ChildTaskDetachArgs,
  ChildTaskFollowUpArgs,
  ChildTaskList,
  ChildTaskListArgs,
  ChildTaskLinkArgs,
  ChildTaskRetryArgs,
  ChildTaskStopArgs,
  ChildTaskSummary,
} from "@/lib/runs/child-task";

interface WindowRunsApi {
  claimSecondary?: (
    args: SecondaryRunClaimArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  executeSecondary?: (
    args: SecondaryRunExecuteArgs,
  ) => Promise<SecondaryRunExecuteResponse>;
  completeSecondary?: (
    args: SecondaryRunCompleteArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  failSecondary?: (
    args: SecondaryRunFailArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  cancelSecondary?: (
    args: SecondaryRunCancelArgs,
  ) => Promise<SecondaryRunTransitionResponse>;
  getSecondary?: (
    args: SecondaryRunLookupArgs,
  ) => Promise<SecondaryRunAggregate | null>;
  listReceipts?: (
    args: SecondaryRunReceiptListArgs,
  ) => Promise<SecondaryRunReceiptList>;
  listChildTasks?: (args: ChildTaskListArgs) => Promise<ChildTaskList>;
  followUpChildTask?: (
    args: ChildTaskFollowUpArgs,
  ) => Promise<ChildTaskActionResponse>;
  retryChildTask?: (
    args: ChildTaskRetryArgs,
  ) => Promise<ChildTaskActionResponse>;
  stopChildTask?: (args: ChildTaskStopArgs) => Promise<ChildTaskActionResponse>;
  detachChildTask?: (
    args: ChildTaskDetachArgs,
  ) => Promise<ChildTaskActionResponse>;
  getChildTaskLink?: (
    args: ChildTaskLinkArgs,
  ) => Promise<ChildTaskSummary | null>;
  onChildTasksChanged?: (
    callback: (payload: { parentTaskId: string }) => void,
  ) => () => void;
}

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
  /** Cancels only the Advisor preflight; the primary turn keeps running. */
  skipAdvisor?: (args: {
    turnId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  steerTurn?: (
    args: ProviderSteerTurnRequest,
  ) => Promise<ProviderSteerTurnResponse>;
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
  }) => Promise<ProviderAvailabilityResponse>;
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
  forkClaudeSession?: (args: {
    sessionId: string;
    upToMessageId: string;
    title?: string;
    cwd?: string;
  }) => Promise<ClaudeSessionForkResponse>;
  rewindClaudeFiles?: (args: {
    sessionId: string;
    userMessageId: string;
    dryRun: boolean;
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudeFileRewindResponse>;
  renameClaudeSession?: (args: {
    sessionId: string;
    title: string;
    cwd?: string;
  }) => Promise<ProviderMutationResponse>;
  reloadClaudePlugins?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudePluginReloadResponse>;
  getClaudeMcpStatus?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudeMcpStatusResponse>;
  getCodexMcpStatus?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexMcpStatusResponse>;
  discoverMcpServers?: (args: {
    cwd?: string;
  }) => Promise<McpDiscoveryResponse>;
  listMcpServerConfigs?: (
    args: McpServerConfigListRequest,
  ) => Promise<McpServerConfigListResponse>;
  previewMcpServerConfigMutation?: (
    args: McpServerConfigMutationRequest,
  ) => Promise<McpServerConfigMutationPreviewResponse>;
  applyMcpServerConfigMutation?: (
    args: McpServerConfigMutationApplyRequest,
  ) => Promise<McpServerConfigMutationResponse>;
  getCodexModelCatalog?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexModelCatalogResponse>;
  getCodexAppServerSnapshot?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<CodexAppServerSnapshotResponse>;
  getRateLimitsSnapshot?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<RateLimitsSnapshotResponse>;
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
  startClaudeMcpOauthLogin?: (args: {
    name: string;
    cwd?: string;
    timeoutSecs?: number;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudeMcpOauthLoginResponse>;
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
    lastTurnId?: string;
    beforeTurnId?: string;
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
  /** Generates a short task title in an isolated, read-only utility turn. */
  suggestTaskName?: (
    args: UtilityInferenceContext & {
      prompt: string;
      history?: Array<{ role: string; content: string }>;
    },
  ) => Promise<{
    ok: boolean;
    title?: string;
    utility: UtilityInferenceMetadata;
  }>;
  classifyRoute?: (
    args: UtilityInferenceContext & {
      prompt: string;
      history?: Array<{
        role: "user" | "assistant";
        content: string;
        providerId?: ProviderId;
        model?: string;
      }>;
      fileContextCount?: number;
    },
  ) => Promise<{
    ok: boolean;
    classification?: RouteClassification;
    utility: UtilityInferenceMetadata;
  }>;
  /** Generates a conventional commit message in a read-only utility turn. */
  suggestCommitMessage?: (args: UtilityInferenceContext) => Promise<{
    ok: boolean;
    message?: string;
    utility: UtilityInferenceMetadata;
  }>;
  /** Generates a PR title and description from the branch diff and commit log
   *  using a read-only single-turn query from the active task provider. */
  suggestPRDescription?: (args: {
    cwd?: string;
    baseBranch?: string;
    /** Workspace branch from the store — used as the authoritative branch
     *  name and for cwd validation on the main-process side. */
    headBranch?: string;
    providerId?: ProviderId;
    promptTemplate?: string;
    workspaceContext?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<{
    ok: boolean;
    title?: string;
    body?: string;
    headBranch?: string;
  }>;
  /** Reviews the branch diff before PR creation using a lightweight
   *  single-turn provider query. Best effort; callers should not block on
   *  `ok: false`. */
  reviewDiff?: (args: {
    cwd?: string;
    baseBranch?: string;
    headBranch?: string;
    providerId?: PrePrReviewProviderId;
    model?: string;
    mode?: "review" | "intent";
    intentContext?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<{
    ok: boolean;
    findings: PrePrReviewFinding[];
    headBranch?: string;
    providerId?: PrePrReviewProviderId;
    truncated?: boolean;
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
  pickDirectory?: () => Promise<{
    ok: boolean;
    directoryPath?: string;
    stderr?: string;
  }>;
  pickFiles?: (args: { rootPath: string }) => Promise<{
    ok: boolean;
    filePaths: string[];
    stderr?: string;
  }>;
  getPathForFile?: (file: File) => string;
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
    tooLarge?: boolean;
    sizeBytes?: number;
    maxSizeBytes?: number;
    stderr?: string;
  }>;
  readFileDataUrl?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    dataUrl: string;
    revision: string;
    tooLarge?: boolean;
    sizeBytes?: number;
    maxSizeBytes?: number;
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
  subscribeTaskTurnUpdates?: (
    listener: (payload: LocalMcpTaskTurnUpdate) => void,
  ) => () => void;
}

interface WindowAtelierConnectorApi {
  getStatus?: () => Promise<{
    ok: boolean;
    status: AtelierConnectorPublicStatus;
    message?: string;
  }>;
  pair?: (args: AtelierConnectorPairInput) => Promise<{
    ok: boolean;
    status: AtelierConnectorPublicStatus;
    message?: string;
  }>;
}

interface WindowMartinSyncApi {
  getStatus?: () => Promise<{
    ok: boolean;
    status: MartinSyncPublicStatus;
    message?: string;
  }>;
  configure?: (args: MartinSyncSettings) => Promise<{
    ok: boolean;
    status: MartinSyncPublicStatus;
    message?: string;
  }>;
  enqueue?: (args: MartinSyncEnqueueArgs) => Promise<{
    ok: boolean;
    status?: MartinSyncPublicStatus;
    message?: string;
  }>;
  notifyLinksChanged?: (args: MartinSyncLinksChangedArgs) => Promise<{
    ok: boolean;
    status?: MartinSyncPublicStatus;
    message?: string;
  }>;
  retryFailed?: () => Promise<{
    ok: boolean;
    status: MartinSyncPublicStatus;
    message?: string;
  }>;
  listProjects?: (args?: MartinListProjectsArgs) => Promise<{
    ok: boolean;
    projects: MartinProjectSummary[];
    message?: string;
  }>;
  linkProject?: (args: MartinLinkProjectArgs) => Promise<{
    ok: boolean;
    project?: WorkspaceMartinProjectLink;
    snapshotRelativePath?: string;
    message?: string;
  }>;
  unlinkProject?: (args: MartinWorkspaceArgs) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  refreshContext?: (args: MartinWorkspaceArgs) => Promise<{
    ok: boolean;
    project?: WorkspaceMartinProjectLink;
    snapshotRelativePath?: string;
    markdown?: string;
    message?: string;
  }>;
  subscribeStatus?: (
    listener: (payload: MartinSyncPublicStatus) => void,
  ) => () => void;
  subscribeMappingStale?: (
    listener: (payload: MartinSyncMappingStalePayload) => void,
  ) => () => void;
}

interface WindowCraneConnectorApi {
  getStatus?: () => Promise<{
    ok: boolean;
    status: CraneConnectorPublicStatus;
    message?: string;
  }>;
  configure?: (args: CraneConnectorConfigInput) => Promise<{
    ok: boolean;
    status: CraneConnectorPublicStatus;
    message?: string;
  }>;
  pair?: (args: CraneConnectorPairInput) => Promise<{
    ok: boolean;
    status: CraneConnectorPublicStatus;
    message?: string;
  }>;
  disconnect?: () => Promise<{
    ok: boolean;
    status: CraneConnectorPublicStatus;
    message?: string;
  }>;
  approve?: (args: CraneDispatchApprovalResponse) => Promise<{
    ok: boolean;
    status: CraneConnectorPublicStatus;
    workspaceId?: string;
    taskId?: string;
    message?: string;
  }>;
  decline?: (args: { jobId: string }) => Promise<{
    ok: boolean;
    status: CraneConnectorPublicStatus;
    message?: string;
  }>;
  subscribeStatus?: (
    listener: (payload: CraneConnectorPublicStatus) => void,
  ) => () => void;
  subscribeApprovalRequests?: (
    listener: (payload: CraneDispatchApprovalRequest) => void,
  ) => () => void;
  subscribeJobUpdates?: (
    listener: (payload: CraneDispatchJobUpdate) => void,
  ) => () => void;
}

interface WindowTaskControlApi {
  takeOver?: (args: { workspaceId: string; taskId: string }) => Promise<{
    ok: boolean;
    workspaceId?: string;
    taskId?: string;
    released?: boolean;
    craneReceiptPending?: boolean;
    message?: string;
  }>;
  stop?: (args: { workspaceId: string; taskId: string }) => Promise<{
    ok: boolean;
    workspaceId?: string;
    taskId?: string;
    stopped?: boolean;
    turnId?: string;
    message?: string;
  }>;
}

interface WindowRoutinesApi {
  setProviderTimeout?: (args: { providerTimeoutMs: number }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  list?: () => Promise<{
    ok: boolean;
    snapshot: RoutineSnapshot;
    message?: string;
  }>;
  create?: (input: RoutineUpsertInput) => Promise<{
    ok: boolean;
    routine: RoutineSpec | null;
    message?: string;
  }>;
  update?: (args: { id: string; input: RoutineUpsertInput }) => Promise<{
    ok: boolean;
    routine: RoutineSpec | null;
    message?: string;
  }>;
  remove?: (args: { id: string }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  setEnabled?: (args: { id: string; enabled: boolean }) => Promise<{
    ok: boolean;
    routine: RoutineSpec | null;
    message?: string;
  }>;
  runNow?: (args: { id: string }) => Promise<{
    ok: boolean;
    run: RoutineRun | null;
    message?: string;
  }>;
  createInformationResource?: (
    input: RoutineInformationResourceCreateInput,
  ) => Promise<{
    ok: boolean;
    option: WorkspaceInformationReferenceOption | null;
    deduplicated?: boolean;
    message?: string;
  }>;
  listInformationReferences?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    options: WorkspaceInformationReferenceOption[];
    message?: string;
  }>;
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
  sequence: number;
  bytes: number;
}

interface TerminalSessionExitPayload {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

interface TerminalSessionStatusPayload {
  sessionId: string;
  status: "prompt-start" | "command-start" | "command-finished" | "prompt-end";
  exitCode?: number;
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
  ackSessionOutput?: (args: {
    sessionId: string;
    attachmentId: string;
    acknowledgedBytes: number;
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
  subscribeSessionStatus?: (
    listener: (payload: TerminalSessionStatusPayload) => void,
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
    snapshotSequence?: number;
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
  oldPath?: string;
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

type SourceControlGraphResult = GraphResult;

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
  tryAutoFixLint?: (args: { cwd?: string; paths?: string[] }) => Promise<{
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
  stageFiles?: (args: {
    paths: string[];
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
  getGraph?: (args: {
    cwd?: string;
    limit?: number;
    skip?: number;
    scope?: "current" | "all" | string;
    refs?: string[];
    includeRepositoryState?: boolean;
  }) => Promise<SourceControlGraphResult>;
  getCommitDetails?: (args: {
    hash: string;
    cwd?: string;
  }) => Promise<GraphCommitDetailsResult>;
  getCommitFiles?: (args: { hash: string; cwd?: string }) => Promise<{
    ok: boolean;
    files: GraphFileChange[];
    stderr: string;
  }>;
  getCommitDiff?: (args: {
    hash: string;
    path: string;
    oldPath?: string;
    cwd?: string;
  }) => Promise<{
    ok: boolean;
    oldContent: string;
    newContent: string;
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
  fetchBranch?: (args: {
    cwd?: string;
    branch?: string;
  }) => Promise<SourceControlCommandResult>;
  createBranch?: (args: {
    name: string;
    cwd?: string;
    from?: string;
  }) => Promise<SourceControlCommandResult>;
  checkoutBranch?: (args: {
    name: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  checkoutDefaultBranchDetached?: (args: { cwd?: string }) => Promise<
    SourceControlCommandResult & {
      /** Resolved remote ref such as `origin/main`, empty when resolution failed. */
      ref: string;
      /** Short commit hash of the detached HEAD, empty when the checkout failed. */
      head: string;
    }
  >;
  pullBranch?: (args: {
    cwd?: string;
    branch?: string;
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
  revert?: (args: {
    commit: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  reset?: (args: {
    commit: string;
    mode: "soft" | "mixed" | "hard";
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  createTag?: (args: {
    name: string;
    commit?: string;
    message?: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  deleteTag?: (args: {
    name: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  renameBranch?: (args: {
    from: string;
    to: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  deleteBranch?: (args: {
    name: string;
    force?: boolean;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  push?: (args: {
    branch?: string;
    remote?: string;
    force?: boolean;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  createPR?: (args: {
    title: string;
    body?: string;
    baseBranch?: string;
    draft?: boolean;
    autoMerge?: boolean;
    mergeMethod?: "default" | "merge" | "squash" | "rebase";
    cwd?: string;
  }) => Promise<{
    ok: boolean;
    prUrl?: string;
    autoMergeEnabled?: boolean;
    autoMergeUnsupported?: boolean;
    merged?: boolean;
    stderr?: string;
  }>;
  getRepoMergeSettings?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    squashMergeAllowed?: boolean;
    mergeCommitAllowed?: boolean;
    rebaseMergeAllowed?: boolean;
    autoMergeAllowed?: boolean;
    stderr: string;
  }>;
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
  /**
   * Metadata only: review threads plus failed checks for a PR. Never fetches a
   * log — see `fetchPrCheckLogs` for explicitly selected failed checks.
   */
  fetchPrContextIndex?: (args: { prUrl: string; cwd?: string }) => Promise<{
    ok: boolean;
    index: PrContextIndex | null;
    stderr: string;
  }>;
  fetchPrCheckLogs?: (args: {
    prUrl: string;
    headSha: string;
    checkIds: number[];
    cwd?: string;
  }) => Promise<{
    ok: boolean;
    excerpts: PrCheckLogExcerpt[];
    stderr: string;
  }>;
  setPrReady?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  mergePr?: (args: {
    method?: "default" | "merge" | "squash" | "rebase";
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
        titleManuallySet?: boolean;
        provider: ProviderId;
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
        /** Delegation link, present only on a delegated child task row. */
        parentTaskId?: string | null;
      }>;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<string, TaskProviderSessionState>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image" | "git-graph";
        language: string;
        content?: string;
        contentState?: "ready" | "deferred" | "loading" | "too-large";
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        fileSizeBytes?: number;
        fileSizeLimitBytes?: number;
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
        titleManuallySet?: boolean;
        provider: ProviderId;
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
        /** Delegation link, present only on a delegated child task row. */
        parentTaskId?: string | null;
      }>;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<string, TaskProviderSessionState>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image" | "git-graph";
        language: string;
        content?: string;
        contentState?: "ready" | "deferred" | "loading" | "too-large";
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        fileSizeBytes?: number;
        fileSizeLimitBytes?: number;
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
        titleManuallySet?: boolean;
        provider: ProviderId;
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
        /** Delegation link, present only on a delegated child task row. */
        parentTaskId?: string | null;
      }>;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerSessionByTask?: Record<string, TaskProviderSessionState>;
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
        titleManuallySet?: boolean;
        provider: ProviderId;
        updatedAt: string;
        unread: boolean;
        archivedAt?: string | null;
        controlMode?: "interactive" | "managed";
        controlOwner?: "stave" | "external";
        /** Delegation link, present only on a delegated child task row. */
        parentTaskId?: string | null;
      }>;
      messageCountByTask?: Record<string, number>;
      terminalTabCount?: number;
      cliSessionTabCount?: number;
      openTaskTabIds?: string[];
    } | null;
  }>;
  loadWorkspace?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        titleManuallySet?: boolean;
        provider: ProviderId;
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
      providerSessionByTask?: Record<string, TaskProviderSessionState>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image" | "git-graph";
        language: string;
        content: string;
        contentState?: "ready" | "deferred" | "loading" | "too-large";
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        fileSizeBytes?: number;
        fileSizeLimitBytes?: number;
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
  truncateTaskMessagesAfter?: (args: {
    workspaceId: string;
    taskId: string;
    messageId: string;
  }) => Promise<{
    ok: boolean;
    removedCount: number;
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
        titleManuallySet?: boolean;
        provider: ProviderId;
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
      providerSessionByTask?: Record<string, TaskProviderSessionState>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image" | "git-graph";
        language: string;
        content: string;
        contentState?: "ready" | "deferred" | "loading" | "too-large";
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        fileSizeBytes?: number;
        fileSizeLimitBytes?: number;
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
  markNotificationRead?: (args: {
    id: string;
    readAt?: string;
    resolvedAt?: string;
  }) => Promise<{
    ok: boolean;
    notification: AppNotification | null;
  }>;
  markAllNotificationsRead?: (args?: { readAt?: string }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  pruneNotifications?: (args?: { now?: string }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  deleteNotificationsForWorkspaces?: (args: {
    workspaceIds: string[];
  }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  deleteOrphanedNotifications?: () => Promise<{
    ok: boolean;
    count: number;
    workspaceIds: string[];
  }>;
  clearNotificationHistory?: () => Promise<{
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
      providerId: ProviderId;
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
      providerId: ProviderId;
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
      providerId: ProviderId;
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
        titleManuallySet?: boolean;
        provider: ProviderId;
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
      providerSessionByTask?: Record<string, TaskProviderSessionState>;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image" | "git-graph";
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
  lens: {
    sessions: number;
    visibleSessions: number;
    managedByMcpSessions: number;
    diagnosticsSessions: number;
    authPopups: number;
    consoleEntries: number;
    networkEntries: number;
    downloadEntries: number;
    retainedViews: number;
    cdpControllers: number;
    cdpClosingControllers: number;
    cdpInFlightCommands: number;
    cdpCloseDrainTimeouts: number;
  };
  renderer: {
    currentlyUnresponsive: boolean;
    unresponsiveEvents: number;
    renderProcessGoneEvents: number;
    lastRenderProcessGoneReason?: string;
  };
  persistence: {
    pageSizeBytes: number;
    pageCount: number;
    freePages: number;
    usedBytes: number;
    fileBytes: number;
    autoVacuum: number;
  } | null;
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
  faviconUrl?: string;
}

interface LensNavigationEventPayload {
  workspaceId: string;
  lensSessionId?: string;
  state: LensNavigationState;
}

interface LensStateChangedPayload {
  workspaceId: string;
  lensSessionId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  faviconUrl?: string;
}

interface LensSessionDescriptor {
  workspaceId: string;
  lensSessionId: string;
  url: string;
  title: string;
  isLoading: boolean;
  managedByMcp: boolean;
  sessionScope: LensSessionScope;
}

interface LensSecurityConfig {
  allowedHosts: string[];
  blockedHosts: string[];
  developerModeCdp: boolean;
  cdpApprovedHosts: string[];
}

interface LensCdpApprovalRequestPayload {
  workspaceId: string;
  /** Originating lens session; absent means the default session ("default"). */
  lensSessionId?: string;
  requestId: string;
  url: string;
  host: string;
  reason: string;
  /** Epoch milliseconds when main will stop accepting this response. */
  expiresAt?: number;
}

interface LensCdpApprovalResponse {
  requestId: string;
  approved: boolean;
  remember?: boolean;
}

type LensSessionScope = "project" | "workspace";

interface LensSessionProfileArgs {
  workspaceId: string;
  sessionScope?: LensSessionScope;
  projectKey?: string | null;
}

type LensDownloadState =
  "progressing" | "completed" | "cancelled" | "interrupted";

interface LensDownloadEntry {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  mimeType?: string;
  totalBytes?: number;
  receivedBytes?: number;
  state: LensDownloadState;
  startedAt: string;
  completedAt?: string;
}

interface LensDownloadEventPayload {
  workspaceId: string;
  lensSessionId?: string;
  entry: LensDownloadEntry;
}

interface LensRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LensStyleEdit {
  property: string;
  before: string;
  after: string;
}

type LensFeedbackIntent = "fix" | "change" | "question" | "approve";
type LensFeedbackPriority = "low" | "medium" | "high";
type LensPageEvidenceTrust = "untrusted-page-evidence";

interface LensPageIdentity {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  scroll: { x: number; y: number };
  documentId: string;
}

interface LensElementContextHint {
  selector?: string;
  tagName: string;
  elementId?: string;
  accessibleName?: string;
  role?: string;
  text?: string;
}

interface LensNearbyElementHint extends LensElementContextHint {
  relation: "parent" | "previous" | "next" | "child" | "within";
}

interface LensAnnotationAnchor {
  selector?: string;
  bounds: LensRect;
  element?: {
    tagName: string;
    id?: string;
    classList: string[];
  };
  accessibleName?: string;
  role?: string;
  attributes: Record<string, string>;
  ancestors: LensElementContextHint[];
  nearby: LensNearbyElementHint[];
  computedStyles: Record<string, string>;
  outerHTML?: string;
  textContent?: string;
  debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
  componentNameChain?: string[];
}

interface LensVisualReviewEnvelope {
  version: 1;
  page: LensPageIdentity;
  anchor: LensAnnotationAnchor;
  evidence: {
    screenshot: {
      kind: "clipped";
      bounds: LensRect;
    };
    styleEdits: LensStyleEdit[];
  };
  feedback: {
    comment: string;
    intent: LensFeedbackIntent;
    priority: LensFeedbackPriority;
  };
  trust: LensPageEvidenceTrust;
}

interface LensAnnotation {
  id: string;
  kind: "element" | "area";
  pin: number;
  rect: LensRect;
  comment: string;
  createdAt: string;
  selector?: string;
  tagName?: string;
  elementId?: string;
  classList?: string[];
  computedStyles?: Record<string, string>;
  outerHTML?: string;
  textContent?: string;
  debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
  componentNameChain?: string[];
  styleEdits?: LensStyleEdit[];
  review: LensVisualReviewEnvelope;
}

type LensAnnotationEventType = "add" | "update" | "remove" | "clear" | "submit";

interface LensAnnotationEventPayload {
  workspaceId: string;
  lensSessionId?: string;
  documentId?: string;
  type: LensAnnotationEventType;
  annotation?: LensAnnotation;
  annotations?: LensAnnotation[];
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
  componentNameChain?: string[];
  page: LensPageIdentity;
  anchor: LensAnnotationAnchor;
  trust: LensPageEvidenceTrust;
}

interface WindowSecretsApi {
  list?: () => Promise<{
    ok: boolean;
    secrets: SecretMetadata[];
    message?: string;
  }>;
  upsert?: (args: SecretUpsertInput) => Promise<{
    ok: boolean;
    secret?: SecretMetadata;
    message?: string;
  }>;
  delete?: (args: { id: string }) => Promise<{ ok: boolean; message?: string }>;
  reveal?: (args: {
    id: string;
  }) => Promise<{ ok: boolean; value?: string; message?: string }>;
}

interface WindowLensApi {
  listCredentials?: () => Promise<{
    ok: boolean;
    credentials: LensCredentialMetadata[];
    message?: string;
  }>;
  upsertCredential?: (args: LensCredentialUpsertInput) => Promise<{
    ok: boolean;
    credential?: LensCredentialMetadata;
    message?: string;
  }>;
  deleteCredential?: (args: {
    id: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  setSecurityConfig?: (args: LensSecurityConfig) => Promise<{
    ok: boolean;
    config?: LensSecurityConfig;
    message?: string;
  }>;
  respondCdpApproval?: (
    args: LensCdpApprovalResponse,
  ) => Promise<{ ok: boolean; message?: string }>;
  createView?: (
    args: LensSessionProfileArgs & { lensSessionId?: string },
  ) => Promise<{
    ok: boolean;
    sessionScope?: LensSessionScope;
    lensSessionId?: string;
    message?: string;
  }>;
  /**
   * Open or adopt a Lens session. Live by the time it resolves: main asks this
   * window for the guest page and waits for the bind before answering.
   */
  openSession?: (
    args: LensSessionProfileArgs & { lensSessionId: string; url?: string },
  ) => Promise<{
    ok: boolean;
    /** True when this call is what brought the session into existence. */
    created?: boolean;
    session?: LensSessionDescriptor;
    message?: string;
  }>;
  /** Hand main the WebContents id of a `<webview>` this window just mounted. */
  bindGuest?: (
    args: LensSessionProfileArgs & {
      lensSessionId: string;
      guestWebContentsId: number;
      managedByMcp?: boolean;
    },
  ) => Promise<{ ok: boolean; created?: boolean; message?: string }>;
  closeSession?: (args: {
    workspaceId: string;
    lensSessionId: string;
  }) => Promise<{ ok: boolean; closed?: boolean }>;
  listSessions?: (args: { workspaceId?: string }) => Promise<{
    ok: boolean;
    sessions?: LensSessionDescriptor[];
  }>;
  destroyView?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean }>;
  clearSessionData?: (args: LensSessionProfileArgs) => Promise<{
    ok: boolean;
    sessionScope?: LensSessionScope;
    message?: string;
  }>;
  setBounds?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => Promise<{ ok: boolean; message?: string }>;
  setVisible?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    visible: boolean;
  }) => Promise<{ ok: boolean }>;
  /**
   * Report whether a panel is showing this session's page.
   *
   * A report, not a command — the element is already shown or hidden. Main uses
   * it to decide which tab an agent call with no explicit session id targets.
   */
  setPresented?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    presented: boolean;
  }) => Promise<{ ok: boolean }>;
  reportGuestFocus?: (payload: LensGuestFocusResultPayload) => void;
  reportGuestMountFailure?: (payload: {
    workspaceId: string;
    lensSessionId: string;
    message?: string;
  }) => void;
  navigate?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    url: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  goBack?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean }>;
  goForward?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean }>;
  reload?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean }>;
  getState?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{
    ok: boolean;
    state?: LensNavigationState;
    annotationModeActive?: boolean;
    boxInspectModeActive?: boolean;
    message?: string;
  }>;
  screenshot?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    options?: {
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
      documentId?: string;
    };
  }) => Promise<{
    ok: boolean;
    dataUrl?: string;
    documentId?: string;
    message?: string;
  }>;
  saveScreenshot?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    options?: {
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
    };
  }) => Promise<{
    ok: boolean;
    path?: string;
    entry?: LensDownloadEntry;
    message?: string;
  }>;
  downloadUrl?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    url: string;
    filename?: string;
  }) => Promise<{ ok: boolean; entry?: LensDownloadEntry; message?: string }>;
  downloadPageAssets?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{
    ok: boolean;
    assetUrls?: string[];
    entries?: LensDownloadEntry[];
    errors?: Array<{ url: string; message: string }>;
    message?: string;
  }>;
  listDownloads?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{
    ok: boolean;
    entries?: LensDownloadEntry[];
    message?: string;
  }>;
  getDom?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    selector?: string;
  }) => Promise<{ ok: boolean; html?: string; message?: string }>;
  evaluate?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    expression: string;
  }) => Promise<{ ok: boolean; result?: unknown; message?: string }>;
  getConsoleLog?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    entries?: LensConsoleEntry[];
    message?: string;
  }>;
  clearConsoleLog?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  getConsoleEntryDetail?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    entryId: string;
  }) => Promise<{
    ok: boolean;
    detail?: BrowserConsoleEntryDetail;
    message?: string;
  }>;
  getConsoleObjectProperties?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    entryId: string;
    objectHandle: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    properties?: BrowserConsoleObjectProperties;
    message?: string;
  }>;
  getNetworkLog?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    entries?: LensNetworkEntry[];
    message?: string;
  }>;
  clearNetworkLog?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  getNetworkEntryDetail?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    entryId: string;
  }) => Promise<{
    ok: boolean;
    detail?: BrowserNetworkEntryDetail;
    message?: string;
  }>;
  getNetworkBody?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    entryId: string;
    kind: "request" | "response";
  }) => Promise<{
    ok: boolean;
    body?: BrowserNetworkBody;
    message?: string;
  }>;
  getDiagnosticsCaptureState?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{
    ok: boolean;
    state?: LensDiagnosticsCaptureState;
    message?: string;
  }>;
  setDiagnosticsCapture?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    enabled: boolean;
  }) => Promise<{
    ok: boolean;
    state?: LensDiagnosticsCaptureState;
    message?: string;
  }>;
  startElementPicker?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    options?: { extractDebugSource?: boolean };
  }) => Promise<{
    ok: boolean;
    result?: LensElementPickerResult;
    message?: string;
  }>;
  startAnnotationMode?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    options?: { extractDebugSource?: boolean };
  }) => Promise<{ ok: boolean; message?: string }>;
  stopAnnotationMode?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  startBoxInspect?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  stopBoxInspect?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  getAnnotations?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{
    ok: boolean;
    annotations?: LensAnnotation[];
    message?: string;
  }>;
  removeAnnotation?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    annotationId: string;
    documentId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  clearAnnotations?: (args: {
    workspaceId: string;
    lensSessionId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  setElementStyle?: (args: {
    workspaceId: string;
    lensSessionId?: string;
    annotationId: string;
    selector: string;
    patch: Record<string, string>;
    documentId: string;
  }) => Promise<{ ok: boolean; edits?: LensStyleEdit[]; message?: string }>;
  subscribeNavigationEvents?: (
    listener: (payload: LensNavigationEventPayload) => void,
  ) => () => void;
  subscribeStateChangedEvents?: (
    listener: (payload: LensStateChangedPayload) => void,
  ) => () => void;
  subscribeSessionClosed?: (
    listener: (payload: LensSessionClosedPayload) => void,
  ) => () => void;
  subscribeGuestRequests?: (
    listener: (payload: LensGuestRequiredPayload) => void,
  ) => () => void;
  subscribeGuestFocusRequests?: (
    listener: (payload: LensGuestFocusRequestPayload) => void,
  ) => () => void;
  subscribePresentationRequests?: (
    listener: (payload: LensSessionPresentationRequestPayload) => void,
  ) => () => void;
  subscribeCdpApprovalRequests?: (
    listener: (payload: LensCdpApprovalRequestPayload) => void,
  ) => () => void;
  subscribeDownloadEvents?: (
    listener: (payload: LensDownloadEventPayload) => void,
  ) => () => void;
  subscribeAnnotationEvents?: (
    listener: (payload: LensAnnotationEventPayload) => void,
  ) => () => void;
  subscribeVisualCommentShortcutEvents?: (
    listener: (payload: {
      workspaceId: string;
      lensSessionId?: string;
      key: string;
      code?: string;
      shiftKey?: boolean;
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      isComposing?: boolean;
    }) => void,
  ) => () => void;
  subscribeConsoleEvents?: (
    listener: (payload: LensConsoleEventPayload) => void,
  ) => () => void;
  subscribeNetworkEvents?: (
    listener: (payload: LensNetworkEventPayload) => void,
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
  runs?: WindowRunsApi;
  provider?: WindowProviderApi;
  persistence?: WindowPersistenceApi;
  fs?: WindowFsApi;
  skills?: WindowSkillsApi;
  localMcp?: WindowLocalMcpApi;
  atelierConnector?: WindowAtelierConnectorApi;
  martinSync?: WindowMartinSyncApi;
  craneConnector?: WindowCraneConnectorApi;
  taskControl?: WindowTaskControlApi;
  routines?: WindowRoutinesApi;
  lsp?: WindowLspApi;
  eslint?: WindowEslintApi;
  diagnostics?: WindowDiagnosticsApi;
  terminal?: WindowTerminalApi;
  notifications?: {
    showNative?: (args: {
      notificationId: string;
      title: string;
      body: string;
      suppress?: boolean;
    }) => Promise<{ ok: boolean; suppressed?: boolean }>;
    setBadge?: (args: { count: number }) => Promise<{ ok: boolean }>;
    subscribeNativeClick?: (
      listener: (payload: { notificationId: string }) => void,
    ) => () => void;
  };
  tooling?: WindowToolingApi;
  scripts?: WindowScriptsApi;
  sourceControl?: WindowSourceControlApi;
  metrics?: WindowMetricsApi;
  inlineCompletion?: WindowInlineCompletionApi;
  lens?: WindowLensApi;
  secrets?: WindowSecretsApi;
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
