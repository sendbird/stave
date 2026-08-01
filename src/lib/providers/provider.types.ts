import type {
  CodeDiffPart,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  MessageRole,
  ToolUsePart,
  UserInputQuestion,
} from "@/types/chat";
import type { SkillPromptContext } from "@/lib/skills/types";

export type ProviderId = "claude-code" | "codex";
export type ClaudeSettingSource = "user" | "project" | "local";

export type ProviderHistoryForkBoundary = "thread" | "turn" | "message";
export type ProviderAppToolApprovalMode =
  "auto" | "prompt" | "writes" | "approve";
export type ProviderWebSearchMode = "disabled" | "cached" | "live" | "indexed";

/**
 * Features that Stave has wired end-to-end for the selected runtime version.
 * This intentionally does not describe every feature the upstream runtime may
 * expose.
 */
export interface ProviderRuntimeCapabilities {
  approval: {
    appToolModes: ProviderAppToolApprovalMode[];
    autoClassifierPolicy: boolean;
    permissionProfiles: boolean;
  };
  sandbox: {
    credentialGuards: boolean;
  };
  history: {
    forkBoundary: ProviderHistoryForkBoundary | null;
    rewind: {
      files: boolean;
      conversation: boolean;
    };
  };
  hooks: {
    lifecycleEvents: boolean;
    inventory: boolean;
    trustManagement: boolean;
  };
  delegationPolicies: Array<"disabled" | "explicit" | "proactive">;
  webSearchModes: ProviderWebSearchMode[];
}

export interface ProviderAvailabilityResponse {
  ok: boolean;
  available: boolean;
  detail: string;
  version?: string;
  capabilities: ProviderRuntimeCapabilities;
}

/**
 * Effort tiers an Advisor target may pin, as the union of both providers'
 * scales. Declared here rather than derived from `ProviderRuntimeOptions` so a
 * persisted Advisor target can never carry Codex's legacy `"minimal"`, which is
 * no longer selectable anywhere in the UI.
 *
 * Which tiers are actually offered is provider- and model-specific; see
 * `resolveAdvisorEffort` for the single point that validates and clamps one.
 */
export type AdvisorEffort =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";

export interface AdvisorTarget {
  providerId: ProviderId;
  model: string;
  /**
   * Explicit effort for the Advisor call. Omitted means "follow the model's
   * provider default", which is what every target did before the tier became
   * selectable — so an absent value is a real choice, not a missing one.
   */
  effort?: AdvisorEffort;
}

/**
 * Advisor lifecycle phases carried by the `advisor_activity` provider event.
 * See `src/lib/providers/advisor-activity.ts` for the reducer and the rationale
 * behind keeping `completed` and `applied` separate.
 */
export type AdvisorActivityPhase =
  | "started"
  | "completed"
  | "applied"
  | "primary_started"
  | "failed"
  | "timeout"
  | "aborted"
  | "skipped";

/** How the runtime actually isolated the advisor call. */
export type AdvisorIsolationMode =
  | "claude-tools-disabled"
  | "codex-ephemeral-read-only";

export interface ProviderSteerTurnRequest {
  turnId: string;
  text: string;
  enabled?: boolean;
  /**
   * Stable client-generated identity forwarded to providers that can echo it
   * back with the injected user message.
   */
  clientMessageId?: string;
}

export interface ProviderSteerTurnResponse {
  ok: boolean;
  message?: string;
  /**
   * `unknown` means the acknowledgement deadline elapsed. The provider may
   * still accept the input, so callers must not silently queue or resend it.
   */
  delivery: "accepted" | "rejected" | "unknown";
}

export interface ProviderCommandCatalogRequest {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}

export interface ClaudeContextUsageSnapshot {
  categories: Array<{
    name: string;
    tokens: number;
    color: string;
    isDeferred?: boolean;
  }>;
  totalTokens: number;
  maxTokens: number;
  rawMaxTokens: number;
  percentage: number;
  model: string;
  memoryFiles: Array<{
    path: string;
    type: string;
    tokens: number;
  }>;
  mcpTools: Array<{
    name: string;
    serverName: string;
    tokens: number;
    isLoaded?: boolean;
  }>;
}

export interface ClaudeContextUsageResponse {
  ok: boolean;
  detail: string;
  usage?: ClaudeContextUsageSnapshot;
}

export interface ClaudeFileRewindResponse {
  ok: boolean;
  detail: string;
  canRewind: boolean;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface ClaudeMcpServerStatusSnapshot {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  error?: string;
  lastError?: string;
  lastErrorAt?: number;
  statusUpdatedAt?: number;
  scope?: string;
  toolCount?: number;
}

export interface ClaudeMcpStatusResponse {
  ok: boolean;
  detail: string;
  servers: ClaudeMcpServerStatusSnapshot[];
  checkedAt: number;
}

export interface ClaudeMcpOauthLoginResponse {
  ok: boolean;
  detail: string;
  authorizationUrl?: string;
  requiresUserAction?: boolean;
  callbackExpected?: boolean;
}

export interface ClaudePluginReloadSnapshot {
  commandCount: number;
  agentCount: number;
  plugins: Array<{
    name: string;
    path: string;
    source?: string;
  }>;
  mcpServers: ClaudeMcpServerStatusSnapshot[];
  errorCount: number;
}

export interface ClaudePluginReloadResponse {
  ok: boolean;
  detail: string;
  reload?: ClaudePluginReloadSnapshot;
}

export interface ClaudeSessionForkResponse {
  ok: boolean;
  detail: string;
  sessionId?: string;
  lastAssistantMessageId?: string;
  /**
   * Source assistant UUID -> forked assistant UUID. Claude remaps transcript
   * UUIDs while forking, so the renderer needs this to keep older fork points
   * actionable inside the new Stave task.
   */
  messageIdMap?: Record<string, string>;
}

export interface ProviderMutationResponse {
  ok: boolean;
  detail: string;
}

export interface CodexMcpServerStatusSnapshot {
  name: string;
  enabled: boolean;
  disabledReason: string | null;
  connectionStatus?:
    | "starting"
    | "connected"
    | "failed"
    | "needs-auth"
    | "cancelled"
    | "disabled"
    | "unknown";
  lastError?: string;
  lastErrorAt?: number;
  statusUpdatedAt?: number;
  failureReason?: string;
  transportType: string;
  url: string | null;
  bearerTokenEnvVar: string | null;
  authStatus: string | null;
  startupTimeoutSec: number | null;
  toolTimeoutSec: number | null;
  tools?: Array<{
    name: string;
    title?: string;
    description?: string;
  }>;
  resources?: Array<{
    uri: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
  }>;
  resourceTemplates?: Array<{
    uriTemplate: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
  }>;
}

export interface CodexMcpStatusResponse {
  ok: boolean;
  detail: string;
  servers: CodexMcpServerStatusSnapshot[];
}

export interface McpDiscoveredServer {
  name: string;
  sources: Array<
    "claude-user" | "claude-project" | "claude-local" | "codex-user"
  >;
  claude: { configured: boolean };
  codex: { configured: boolean };
  transport: "stdio" | "http" | "sse" | "unknown";
}

export interface McpDiscoveryResponse {
  ok: boolean;
  servers: McpDiscoveredServer[];
  errors: string[];
  discoveredAt: number;
}

export interface CodexModelCatalogEntry {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  supportsPersonality: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: string[];
  inputModalities: string[];
  additionalSpeedTiers: string[];
  upgrade: string | null;
  upgradeInfo: {
    model: string;
    upgradeCopy: string | null;
    modelLink: string | null;
    migrationMarkdown: string | null;
  } | null;
  availabilityNux: string | null;
}

export interface CodexModelCatalogResponse {
  ok: boolean;
  detail: string;
  models: CodexModelCatalogEntry[];
}

export interface CodexSkillSnapshot {
  name: string;
  description: string;
  shortDescription?: string | null;
  path: string;
  scope: string;
  enabled: boolean;
}

export interface CodexSkillCatalogGroup {
  cwd: string;
  skills: CodexSkillSnapshot[];
  errors: string[];
}

export interface CodexHookSnapshot {
  key: string;
  eventName: string;
  handlerType: string;
  enabled: boolean;
  source: string;
  sourcePath: string;
  trustStatus: string;
  isManaged: boolean;
  statusMessage: string | null;
}

export interface CodexHookCatalogGroup {
  cwd: string;
  hooks: CodexHookSnapshot[];
  errors: string[];
  warnings: string[];
}

export interface CodexPluginMarketplaceSnapshot {
  name: string;
  path: string;
  displayName: string | null;
}

export interface CodexPluginSummarySnapshot {
  id: string;
  name: string;
  marketplaceName: string;
  marketplacePath: string;
  marketplaceDisplayName: string | null;
  source: string;
  installed: boolean;
  enabled: boolean;
  installPolicy: string;
  authPolicy: string;
}

export interface CodexPluginDetailSnapshot {
  marketplaceName: string;
  marketplacePath: string;
  id: string;
  name: string;
  source: string;
  installed: boolean;
  enabled: boolean;
  installPolicy: string;
  authPolicy: string;
  description: string | null;
  skills: Array<{
    name: string;
    description: string;
    shortDescription: string | null;
    path: string;
    enabled: boolean;
  }>;
  apps: Array<{
    id: string;
    name: string;
    description: string | null;
    installUrl: string | null;
    needsAuth: boolean;
  }>;
  mcpServers: string[];
}

export interface CodexPluginDetailResponse {
  ok: boolean;
  detail: string;
  plugin?: CodexPluginDetailSnapshot;
}

export interface CodexPluginInstallResponse {
  ok: boolean;
  detail: string;
  authPolicy: string | null;
  appsNeedingAuth: Array<{
    id: string;
    name: string;
    description: string | null;
    installUrl: string | null;
    needsAuth: boolean;
  }>;
}

export interface CodexAppSnapshot {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  distributionChannel: string | null;
  installUrl: string | null;
  isAccessible: boolean;
  isEnabled: boolean;
  pluginDisplayNames: string[];
  labels: Record<string, string> | null;
}

export interface CodexAccountSnapshot {
  type: "apiKey" | "chatgpt" | "unknown";
  email: string | null;
  planType: string | null;
  requiresOpenaiAuth: boolean;
}

export interface CodexCreditsSnapshot {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
}

export interface CodexRateLimitWindowSnapshot {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

/**
 * Credit-style usage limit reported by newer Codex plans (e.g. business):
 * `account/rateLimits/read` returns `primary`/`secondary` as null and puts
 * the real numbers in `individualLimit` (used/limit credits + reset time).
 */
export interface CodexIndividualLimitSnapshot {
  usedPercent: number;
  used: number | null;
  limit: number | null;
  resetsAt: number | null;
}

export interface CodexRateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: CodexRateLimitWindowSnapshot | null;
  secondary: CodexRateLimitWindowSnapshot | null;
  individualLimit: CodexIndividualLimitSnapshot | null;
  credits: CodexCreditsSnapshot | null;
}

/**
 * Status-bar usage tracking (Claude session/weekly/model-specific weekly +
 * Codex rate-limit
 * buckets). "source" tells the renderer which pipeline produced the data so
 * it can render an accurate provenance hint instead of a generic error.
 */
export type ClaudeUsageSource = "oauth" | "cli" | "unavailable";

export interface ClaudeUsageWindow {
  usedPercent: number;
  resetsAt: number | null;
}

export interface ClaudeUsageSnapshot {
  source: ClaudeUsageSource;
  session: ClaudeUsageWindow | null;
  weekly: ClaudeUsageWindow | null;
  fableWeekly: ClaudeUsageWindow | null;
  error: string | null;
}

export type CodexUsageSource = "rpc" | "unavailable";

export interface CodexUsageSnapshot {
  source: CodexUsageSource;
  buckets: CodexRateLimitSnapshot[];
  error: string | null;
}

export interface RateLimitsSnapshotResponse {
  claude: ClaudeUsageSnapshot;
  codex: CodexUsageSnapshot;
}

export interface CodexThreadSnapshot {
  id: string;
  forkedFromId: string | null;
  preview: string;
  modelProvider: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  cwd: string;
  cliVersion: string;
  source: string;
  agentNickname: string | null;
  agentRole: string | null;
  name: string | null;
  archived: boolean;
}

export interface CodexThreadDetailSnapshot extends CodexThreadSnapshot {
  turnCount: number | null;
  raw: Record<string, unknown>;
}

export interface CodexThreadReadResponse {
  ok: boolean;
  detail: string;
  thread?: CodexThreadDetailSnapshot;
}

export interface CodexThreadForkResponse {
  ok: boolean;
  detail: string;
  threadId?: string;
  /** Native turn ids present in the forked thread, in provider order. */
  turnIds?: string[];
}

export interface CodexExperimentalFeatureSnapshot {
  name: string;
  stage: string;
  displayName: string | null;
  description: string | null;
  announcement: string | null;
  enabled: boolean;
  defaultEnabled: boolean;
}

export interface CodexConfigLayerSnapshot {
  name: string;
  version: string;
  disabledReason: string | null;
  config: unknown;
}

export interface CodexConfigOriginSnapshot {
  name: string;
  version: string;
}

export interface CodexConfigRequirementsSnapshot {
  allowedApprovalPolicies: string[] | null;
  allowedSandboxModes: string[] | null;
  allowedWebSearchModes: string[] | null;
  featureRequirements: Record<string, boolean> | null;
  enforceResidency: string | null;
}

export interface CodexExternalAgentConfigMigrationItem {
  itemType: string;
  description: string;
  cwd: string | null;
}

export interface CodexConfigSnapshot {
  config: Record<string, unknown>;
  origins: Record<string, CodexConfigOriginSnapshot>;
  layers: CodexConfigLayerSnapshot[];
}

export interface CodexAppServerSnapshot {
  account: CodexAccountSnapshot | null;
  rateLimits: CodexRateLimitSnapshot[];
  skills: CodexSkillCatalogGroup[];
  hooks: CodexHookCatalogGroup[];
  pluginMarketplaces: CodexPluginMarketplaceSnapshot[];
  plugins: CodexPluginSummarySnapshot[];
  pluginMarketplaceLoadErrors: string[];
  apps: CodexAppSnapshot[];
  experimentalFeatures: CodexExperimentalFeatureSnapshot[];
  mcpServers: CodexMcpServerStatusSnapshot[];
  threads: CodexThreadSnapshot[];
  archivedThreads: CodexThreadSnapshot[];
  config: CodexConfigSnapshot | null;
  configRequirements: CodexConfigRequirementsSnapshot | null;
  externalAgentConfigItems: CodexExternalAgentConfigMigrationItem[];
}

export interface CodexAppServerSnapshotResponse {
  ok: boolean;
  detail: string;
  sectionErrors: Record<string, string>;
  snapshot?: CodexAppServerSnapshot;
}

export interface CodexMcpOauthLoginResponse {
  ok: boolean;
  detail: string;
  authorizationUrl?: string;
}

export interface CodexMcpResourceReadResponse {
  ok: boolean;
  detail: string;
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

export interface CodexReviewStartResponse {
  ok: boolean;
  detail: string;
  reviewThreadId?: string;
  turnId?: string;
}

export type CodexMutationResponse = ProviderMutationResponse;

export interface CanonicalRetrievedContextPart {
  type: "retrieved_context";
  sourceId: string;
  title?: string;
  content: string;
}

export interface CanonicalSkillContextPart {
  type: "skill_context";
  skills: SkillPromptContext[];
}

export interface CanonicalConversationMessage {
  messageId?: string;
  role: MessageRole;
  providerId?: ProviderId | "user";
  model?: string;
  content: string;
  parts: MessagePart[];
  isPlanResponse?: boolean;
  planText?: string;
}

export interface CanonicalConversationRequest {
  turnId?: string;
  taskId?: string;
  workspaceId?: string;
  target: {
    providerId: ProviderId;
    model?: string;
  };
  mode: "chat" | "review";
  history: CanonicalConversationMessage[];
  input: CanonicalConversationMessage & { role: "user" };
  contextParts: Array<
    | FileContextPart
    | CanonicalRetrievedContextPart
    | ImageContextPart
    | CanonicalSkillContextPart
  >;
  resume?: {
    nativeSessionId?: string;
    syncedThroughMessageId?: string;
  };
}

export type ProviderGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export interface ProviderGoalSnapshot {
  providerId: "codex";
  nativeSessionId: string;
  objective: string;
  status: ProviderGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export type NormalizedProviderEvent =
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string; segmentId?: string }
  | {
      type: "provider_session";
      providerId: ProviderId;
      nativeSessionId: string;
    }
  | {
      type: "provider_turn";
      providerId: ProviderId;
      nativeSessionId: string;
      nativeTurnId: string;
    }
  | {
      type: "goal_status";
      providerId: "codex";
      goal: ProviderGoalSnapshot | null;
    }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
      totalCostUsd?: number;
      ttftMs?: number;
    }
  | { type: "prompt_suggestions"; suggestions: string[] }
  | {
      /**
       * Structured advisor lifecycle signal. Replaces string-sniffing a
       * `system` trace, and is the only channel that can distinguish "advisor
       * produced advice" from "advice reached the primary prompt".
       */
      type: "advisor_activity";
      phase: AdvisorActivityPhase;
      /** Provider running the primary turn that asked for advice. */
      primaryProviderId: ProviderId;
      /** Primary model id, so "a different model answered" is verifiable. */
      primaryModel?: string;
      /** Advisor provider. Absent when the configured target was unusable. */
      advisorProviderId?: ProviderId;
      advisorModel?: string;
      /**
       * Effort the runtime actually requested, after defaulting and clamping.
       * Reported rather than re-derived in the renderer for the same reason as
       * `isolation`: the UI must not claim a tier the call did not use.
       */
      advisorEffort?: AdvisorEffort;
      isolation?: AdvisorIsolationMode;
      /** Wall-clock timestamp of this phase, from the main process. */
      at: number;
      /** Advisor deadline, reported on `started` so the UI can count down. */
      timeoutMs?: number;
      durationMs?: number;
      /** Advisor-authored advice. Only on `completed`. */
      advice?: string;
      adviceChars?: number;
      /** Only on `applied`: what actually landed in the primary prompt. */
      injectedChars?: number;
      injectedPartIndex?: number;
      /** Failure, timeout, or skip reason. */
      detail?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalCostUsd?: number;
    }
  | {
      type: "history_boundary";
      providerId: ProviderId;
      boundaryKind: ProviderHistoryForkBoundary;
      nativeId: string;
      targetRole: "user" | "assistant";
    }
  | {
      type: "permission_denial";
      toolName: string;
      message: string;
      reasonType?: string;
      reason?: string;
    }
  | {
      type: "hook_activity";
      hookId: string;
      hookName: string;
      hookEvent: string;
      status: "running" | "completed" | "failed" | "cancelled" | "blocked";
    }
  | {
      type: "tool";
      toolUseId?: string;
      toolName: string;
      input: string;
      output?: string;
      state: ToolUsePart["state"];
    }
  | {
      type: "tool_progress";
      toolUseId: string;
      toolName: string;
      elapsedSeconds: number;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      output: string;
      isError?: boolean;
      isPartial?: boolean;
    }
  | {
      type: "diff";
      filePath: string;
      oldContent: string;
      newContent: string;
      status?: CodeDiffPart["status"];
    }
  | {
      type: "approval";
      toolName: string;
      requestId: string;
      description: string;
      input?: string;
    }
  | {
      type: "user_input";
      toolName: string;
      requestId: string;
      questions: UserInputQuestion[];
    }
  | { type: "plan_ready"; planText: string; sourceSegmentId?: string }
  | {
      type: "system";
      content: string;
      compactBoundary?: {
        trigger?: string;
        gitRef?: string;
      };
    }
  | { type: "subagent_progress"; toolUseId?: string; content: string }
  | {
      type: "model_resolved";
      resolvedProviderId: ProviderId;
      resolvedModel: string;
    }
  | { type: "error"; message: string; recoverable: boolean }
  | {
      type: "done";
      stop_reason?:
        "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | string;
    };

export interface ProviderTurnRequest {
  turnId?: string;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

export interface ProviderRuntimeOptions {
  model?: string;
  chatStreamingEnabled?: boolean;
  debug?: boolean;
  providerTimeoutMs?: number;
  claudeBinaryPath?: string;
  claudePermissionMode?:
    | "default"
    | "acceptEdits"
    | "bypassPermissions"
    | "plan"
    | "dontAsk"
    | "auto";
  /** How much plan-mode auto-approves non-mutating tool calls (Bash/Task/MCP). */
  claudePlanModeApprovalScope?:
    "strict" | "bash" | "bashAndTask" | "bashTaskAndMcp";
  claudeAllowDangerouslySkipPermissions?: boolean;
  claudeSandboxEnabled?: boolean;
  claudeAllowUnsandboxedCommands?: boolean;
  /** File paths the Claude sandbox must deny as credentials. */
  claudeSandboxCredentialFiles?: string[];
  /** Environment variable names the Claude sandbox must deny as credentials. */
  claudeSandboxCredentialEnvVars?: string[];
  claudeSystemPrompt?: string;
  claudeMaxTurns?: number;
  claudeMaxBudgetUsd?: number;
  claudeTaskBudgetTokens?: number;
  claudeSettingSources?: ClaudeSettingSource[];
  claudeEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  claudeThinkingMode?: "adaptive" | "enabled" | "disabled";
  claudeAgentProgressSummaries?: boolean;
  claudePromptSuggestions?: boolean;
  claudeForwardSubagentText?: boolean;
  claudeEnableFileCheckpointing?: boolean;
  claudeForkSession?: boolean;
  claudeStrictMcpConfig?: boolean;
  claudeFastMode?: boolean;
  claudeAllowedTools?: string[];
  claudeDisallowedTools?: string[];
  trustedTools?: string[];
  claudeSkills?: "all" | string[];
  claudePluginPaths?: string[];
  claudeAgentName?: string;
  claudeFallbackModel?: string;
  claudeResumeSessionId?: string;
  claudeResumeSessionAt?: string;
  codexFileAccess?: "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess?: boolean;
  codexApprovalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  /**
   * Stave-hosted unattended runs may approve only the managed `stave-local`
   * MCP server without widening Codex's filesystem sandbox.
   */
  codexAutoApproveStaveLocalMcpTools?: boolean;
  codexBinaryPath?: string;
  // "minimal" is a legacy value kept for persisted settings; the runtime maps
  // it to "low". "max" and "ultra" arrived with the GPT-5.6 Codex CLI scale.
  codexReasoningEffort?:
    "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
  codexWebSearch?: ProviderWebSearchMode;
  /** Global Codex App/MCP tool approval mode. Independent from shell approval. */
  codexAppToolApprovalMode?: "inherit" | ProviderAppToolApprovalMode;
  codexShowRawReasoning?: boolean;
  codexReasoningSummary?: "auto" | "concise" | "detailed" | "none";
  codexReasoningSummarySupport?: "auto" | "enabled" | "disabled";
  codexFastMode?: boolean;
  codexPlanMode?: boolean;
  codexResumeThreadId?: string;
  /**
   * Optional Stave-managed, isolated read-only preflight for a normal user
   * turn. Runtimes must clear this before invoking the primary provider so an
   * Advisor can never recursively launch another Advisor.
   */
  advisorTarget?: AdvisorTarget;
  // ---- Customisable AI prompt overrides ----
  /** Response formatting guidance injected into both Claude and Codex. */
  responseStylePrompt?: string;
  /** Custom prompt template for AI-generated PR descriptions. */
  promptPrDescription?: string;
  /** Custom system prompt for inline code completion. */
  promptInlineCompletion?: string;
  /**
   * Ids of vault secrets the user bound to this task. Only ids travel here; the
   * main process resolves them to environment variables at spawn/thread-start
   * so the plaintext never enters the renderer or the model's text channel.
   */
  boundSecretIds?: string[];
}

export interface ProviderAdapter {
  id: ProviderId;
  runTurn: (
    args: ProviderTurnRequest,
  ) => AsyncGenerator<NormalizedProviderEvent, void, unknown>;
}

export interface ProviderEventSource<TRawEvent> {
  streamTurn: (
    args: ProviderTurnRequest,
  ) => AsyncGenerator<TRawEvent, void, unknown>;
}

export interface ProviderEventNormalizer<TRawEvent> {
  normalize: (args: {
    event: TRawEvent;
  }) => NormalizedProviderEvent | NormalizedProviderEvent[];
}
