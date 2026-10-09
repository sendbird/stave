import type { McpAppViewReference } from "@/lib/mcp-app/mcp-app-view";
import type { AgentTurnProvenance } from "../agents/turn-provenance";
import type { ModelExecution } from "./model-execution";
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

export type ProviderId = "claude-code" | "codex" | "cursor" | "kiro";
export type ManagedExecutionProviderId = Exclude<ProviderId, "cursor" | "kiro">;
export type ClaudeSettingSource = "user" | "project" | "local";

/**
 * Evidence emitted only when Stave selected a primary model through automatic
 * routing. Explicit user selections deliberately carry no inferred rationale.
 */
export interface AutoRoutingModelResolution {
  /** Target selected by automatic routing before the runtime confirms execution. */
  selectedProviderId: ProviderId;
  selectedModel: string;
  source: "heuristic" | "classifier" | "classifier_fallback";
  rationale: string;
  confidence: number | null;
  taskType:
    | "quick_edit"
    | "plan"
    | "implementation"
    | "debug"
    | "review"
    | "general"
    | "safety";
  /** Role-table rule that fired, when the v2 router made the decision. */
  ruleId?: string;
  /** Human sentence for the rule plus any stance or budget adjustment. */
  ruleReason?: string;
  taskClass?: string;
  stance?: string;
  /** Wall time spent waiting on the classifier, when one ran for this turn. */
  classifierElapsedMs?: number;
}

export type ProviderHistoryForkBoundary = "thread" | "turn" | "message";
export type ProviderAppToolApprovalMode =
  "auto" | "prompt" | "writes" | "approve";
export type ProviderWebSearchMode = "disabled" | "cached" | "live" | "indexed";

/**
 * Usage attributable to one delegated execution. `advisor` and `worker` name
 * the retired in-turn delegations; usage saved by earlier builds keeps them.
 *
 * The turn-level `usage` event remains the billing total. These records are a
 * persisted breakdown only, so consumers must never add them to that total a
 * second time. Token fields stay optional because several native and ACP
 * runtimes expose the execution identity without reporting delegated usage.
 */
export interface DelegatedExecutionUsage {
  executionId: string;
  role: "advisor" | "worker";
  providerId: ProviderId;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  thoughtTokens?: number;
  contextUsedTokens?: number;
  contextWindowTokens?: number;
  contextUsedPercent?: number;
  contextCostAmount?: number;
  contextCostCurrency?: string;
  totalCostUsd?: number;
  sessionReused?: boolean;
}

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
  workGraph: ProviderWorkGraphCapabilities;
}

/**
 * What the runtime lets the work graph know and do about agents running inside
 * a turn. Every field is a claim Stave has wired end-to-end, so `false` means
 * "no control is offered" rather than "we did not check" — a control the
 * provider cannot target at one agent is never rendered, because a Stop button
 * that actually cancels the whole turn would be lying about its scope.
 */
export interface ProviderWorkGraphCapabilities {
  /**
   * The runtime names each spawned agent, so graph nodes key off provider
   * identity instead of a bare tool-use id.
   */
  agentIdentity: boolean;
  /** The runtime reports parent→child nesting rather than leaving it inferred. */
  nesting: boolean;
  /** Send a message to one running agent without disturbing its siblings. */
  message: boolean;
  /** Interrupt one running agent and let the turn continue. */
  interrupt: boolean;
  /** Stop one running agent and let the turn continue. */
  stop: boolean;
}

export interface ProviderAvailabilityResponse {
  toolingStatus?: import("../tooling-status").ToolingStatusEntry;
  ok: boolean;
  available: boolean;
  detail: string;
  version?: string;
  capabilities: ProviderRuntimeCapabilities;
}

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
export interface CursorMcpOauthLoginResponse {
  ok: boolean;
  detail: string;
}

/** Stave policy for plugins installed through the Claude CLI. */
export type ClaudePluginMode = "off" | "claude-config" | "all";

export interface ClaudeInstalledPluginSummary {
  id: string;
  name: string;
  marketplace: string;
  version?: string;
  installPath?: string;
  description?: string;
  scopes: Array<"user" | "project">;
  /** Whether Claude's own settings cascade enables this plugin. */
  enabledInClaudeConfig: boolean;
  enabledSource?: "user" | "project" | "local";
  /** Effective decision after Stave's plugin mode and overrides. */
  enabled: boolean;
}

export interface ClaudeInstalledPluginsResponse {
  ok: boolean;
  detail: string;
  configDir?: string;
  plugins: ClaudeInstalledPluginSummary[];
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
    | "claude-user"
    | "claude-project"
    | "claude-local"
    | "codex-user"
    | "cursor-user"
    | "cursor-project"
    | "kiro-user"
    | "kiro-project"
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

export interface ProviderModelCatalogEntry {
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultEffort: string | null;
  supportedEfforts: string[];
  /** Picker group under the runtime, such as "Company gateway · API billing". */
  group?: string;
  /** Short tag beside the name, such as "experimental". */
  badge?: string;
}

export interface ProviderModelCatalogResponse {
  providerId: ProviderId;
  ok: boolean;
  detail: string;
  models: ProviderModelCatalogEntry[];
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

export interface AccountUsageWindow {
  usedPercent: number;
  resetsAt: number | null;
  used: number | null;
  limit: number | null;
}

export interface AccountUsageBucket extends AccountUsageWindow {
  id: string;
  label: string;
  unit: string | null;
}

export type CursorUsageSource = "dashboard" | "unavailable";

export interface CursorUsageSnapshot {
  source: CursorUsageSource;
  planType: string | null;
  monthly: AccountUsageWindow | null;
  buckets: AccountUsageBucket[];
  error: string | null;
}

export type KiroUsageSource = "acp" | "unavailable";

export interface KiroUsageSnapshot {
  source: KiroUsageSource;
  planName: string | null;
  monthly: AccountUsageWindow | null;
  buckets: AccountUsageBucket[];
  overagesEnabled: boolean | null;
  error: string | null;
}

export interface RateLimitsSnapshotResponse {
  claude: ClaudeUsageSnapshot;
  codex: CodexUsageSnapshot;
  cursor: CursorUsageSnapshot;
  kiro: KiroUsageSnapshot;
  /** Per-request feedback; older hosts may omit it. Never saved as an observation. */
  reads?: Partial<Record<ProviderId, import("./quota-read-feedback").QuotaReadFeedback>>;
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
  | { type: "agent_provenance"; provenance: AgentTurnProvenance }
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string; segmentId?: string }
  | {
      type: "provider_session";
      accountProfileId?: string;
      providerId: ProviderId;
      nativeSessionId: string;
    }
  | {
      type: "provider_turn";
      accountProfileId?: string;
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
      thoughtTokens?: number;
      totalCostUsd?: number;
      ttftMs?: number;
    }
  | {
      type: "context_usage";
      /** Absent when the provider only reports a percentage (e.g. Kiro). */
      usedTokens?: number;
      sizeTokens?: number;
      /** 0-100. Reported directly by providers that hide the window size. */
      usedPercent?: number;
      costAmount?: number;
      /** ISO currency code, or a provider-native unit such as "credits". */
      costCurrency?: string;
    }
  | {
      type: "delegated_usage";
      executionId: string;
      role: "advisor" | "worker";
      providerId: ProviderId;
      model: string;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
      thoughtTokens?: number;
      contextUsedTokens?: number;
      contextWindowTokens?: number;
      contextUsedPercent?: number;
      contextCostAmount?: number;
      contextCostCurrency?: string;
      totalCostUsd?: number;
      sessionReused?: boolean;
    }
  | { type: "prompt_suggestions"; suggestions: string[] }
  | {
      type: "history_boundary";
      accountProfileId?: string;
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
      /**
       * Where the handler was declared, when the provider reports it (Codex
       * names the hooks file; Claude does not). Kept out of `hookName` so the
       * activity shelf can title a row from the normalized event and show the
       * provider's own identifiers as separate, clearly provider-specific
       * detail.
       */
      hookSource?: string;
      status: "running" | "completed" | "failed" | "cancelled" | "blocked";
    }
  | {
      type: "tool";
      toolUseId?: string;
      toolName: string;
      input: string;
      output?: string;
      state: ToolUsePart["state"];
      /**
       * Provider-owned identity of the agent this event is *about* — the agent
       * a delegating call spawned (Codex's child `agentThreadId`). The work
       * graph keys nodes off this rather than off `toolUseId`, because a
       * tool-use id names one call while an agent id names the worker that
       * outlives it.
       *
       * Distinct from `ownerAgentId`, and the two must never be merged: this
       * one points *down* to a spawned worker, that one points *up* to the
       * worker we are already inside. Collapsing them inverts an edge.
       */
      agentId?: string;
      /**
       * Provider-owned identity of the agent that *emitted* this event, when
       * the activity happened inside a subagent rather than the main loop
       * (Claude's hook `agent_id`). Absent means the main loop.
       */
      ownerAgentId?: string;
      /**
       * The tool call this one ran *inside*, when the provider reports nesting
       * (Claude's `parent_tool_use_id`). Absent means top level; it never means
       * "unknown parent" — the graph leaves such nodes attached to the turn.
       */
      parentToolUseId?: string;
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
      /** Explicit process status from a structured provider command result. */
      exitCode?: number | null;
      /** The MCP App view this call produced; see `src/lib/mcp-app`. */
      mcpAppView?: McpAppViewReference;
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
      /** See the main-process `approval` event: an allow-always option exists. */
      supportsAllowAlways?: boolean;
      /**
       * See `tool.ownerAgentId`: the subagent whose work is stopped until this
       * is answered. Absent means the main loop asked.
       *
       * Carried so the work graph can say *who* is blocked. Without it every
       * prompt reads as the turn being stuck, and a fan-out where one worker of
       * six is waiting on a person looks identical to one where all six are.
       */
      ownerAgentId?: string;
    }
  | {
      type: "user_input";
      /** Async messages remain answerable after their emitting turn ends. */
      delivery?: "async";
      toolName: string;
      requestId: string;
      questions: UserInputQuestion[];
      /** See `approval.ownerAgentId`. */
      ownerAgentId?: string;
    }
  | {
      type: "system";
      content: string;
      compactBoundary?: {
        trigger?: string;
        gitRef?: string;
      };
    }
  | {
      type: "subagent_progress";
      toolUseId?: string;
      content: string;
      /** See `tool.agentId`: the subagent this progress is reporting on. */
      agentId?: string;
      /** See `tool.ownerAgentId`: the subagent that emitted this progress. */
      ownerAgentId?: string;
      /**
       * How confidently `toolUseId` was correlated to this progress. Absent
       * means `authoritative`. A `guess` (Claude's positional fallback) may
       * route the text to a row, but the work graph must never create or
       * overwrite a spawn↔identity binding from it — a laundered guess
       * permanently cross-wires two concurrent workers.
       */
      binding?: "authoritative" | "guess";
    }
  | {
      type: "model_resolved";
      resolvedProviderId: ProviderId;
      resolvedModel: string;
      modelExecution?: ModelExecution;
      /** Present only for Stave's automatic primary-model routing decision. */
      modelResolution?: AutoRoutingModelResolution;
    }
  | { type: "error"; message: string; recoverable: boolean }
  | {
      type: "done";
      accountProfileId?: string;
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

/** A Stave guardrail an Agent-mode Claude turn can be set to stop for. */
export type ClaudeGuardrailId = "G1" | "G2" | "G3";
export const CLAUDE_GUARDRAIL_IDS: readonly ClaudeGuardrailId[] = ["G1", "G2", "G3"];

/** The known guardrail ids in `value`, deduplicated in G1-G3 order. Anything else is dropped. */
export function normalizeClaudeGuardrails(value: unknown): ClaudeGuardrailId[] {
  const list = Array.isArray(value) ? value : [];
  return CLAUDE_GUARDRAIL_IDS.filter((id) => list.includes(id));
}

/**
 * The guardrails an Agent-mode turn runs for a `claudeGuardrails` value. All
 * three are on by default, so only an explicit list (empty to run none)
 * narrows them.
 */
export function agentModeClaudeGuardrails(value: unknown): ClaudeGuardrailId[] {
  return value === undefined ? [...CLAUDE_GUARDRAIL_IDS] : normalizeClaudeGuardrails(value);
}

export interface ProviderRuntimeOptions {
  claudeAccountProfileId?: string;
  codexAccountProfileId?: string;
  model?: string;
  chatStreamingEnabled?: boolean;
  debug?: boolean;
  providerTimeoutMs?: number;
  claudeBinaryPath?: string;
  claudePermissionMode?:
    | "default"
    | "acceptEdits"
    | "bypassPermissions"
    | "dontAsk"
    | "auto";
  claudeAllowDangerouslySkipPermissions?: boolean;
  claudeSandboxEnabled?: boolean;
  claudeAllowUnsandboxedCommands?: boolean;
  /**
   * Restrictive only: forces the sandbox on with no unsandboxed escape, denies
   * every filesystem write from sandboxed commands, and stops a command from
   * being approved just because it is sandboxed. Read-only delegated tasks set
   * it so their Bash cannot change the workspace whatever else is allowed.
   */
  claudeSandboxReadOnly?: boolean;
  /** File paths the Claude sandbox must deny as credentials. */
  claudeSandboxCredentialFiles?: string[];
  /** Environment variable names the Claude sandbox must deny as credentials. */
  claudeSandboxCredentialEnvVars?: string[];
  /**
   * The Stave guardrails an Agent-mode Claude turn stops for (`G1` writes
   * outside the repository, `G2` credentials, `G3` irreversible remote
   * actions). Absent runs all three; an empty list runs none. Turns outside
   * Agent mode never run them.
   */
  claudeGuardrails?: ClaudeGuardrailId[];
  /**
   * Set by the host turn policy on an Agent-mode turn and carried to the
   * helpers it delegates, so they run the same guardrails. Never user-set.
   */
  claudeAgentTurn?: boolean;
  /** `claudeAgentTurn` for a Codex turn, so a Claude helper of a Codex Agent still runs the guardrails. */
  codexAgentTurn?: boolean;
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
  /**
   * Provider-agnostic: mirrors the `providerBrowserAutoFallback` setting so the
   * turn-start browser gate in both runtimes can arm `@web` for a host that a
   * token-less fetch cannot read.
   */
  providerBrowserAutoFallback?: boolean;
  /**
   * Mirrors the `mcpAppViewsEnabled` setting. Codex advertises the MCP Apps UI
   * extension at App Server `initialize` only when this is on, and both Codex
   * and Claude capture a tool's `ui://` view only when it is on.
   */
  mcpAppViews?: boolean;
  /** Extra auto-arm hosts, unparsed; see `parseProviderBrowserDomains`. */
  providerBrowserAutoFallbackDomains?: string;
  claudeFastMode?: boolean;
  claudeAllowedTools?: string[];
  claudeDisallowedTools?: string[];
  trustedTools?: string[];
  claudeSkills?: "all" | string[];
  claudePluginPaths?: string[];
  /**
   * Policy for plugins installed through the Claude CLI
   * (`claude plugin install`). `claude-config` honors Claude's own
   * `enabledPlugins` cascade, `all` enables every install, `off` loads none.
   */
  claudePluginMode?: ClaudePluginMode;
  /** Per-plugin Stave overrides keyed by `<name>@<marketplace>`. */
  claudePluginOverrides?: Record<string, boolean>;
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
  codexResumeThreadId?: string;
  cursorBinaryPath?: string;
  cursorMode?: "agent" | "ask";
  /**
   * Approval autonomy for interactive Cursor turns, delivered as `agent acp`
   * process flags: `manual` sends none, `guided` sends `--auto-review`, and
   * `auto` sends `--force --approve-mcps`.
   */
  cursorApprovalMode?: "manual" | "guided" | "auto";
  cursorEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  cursorFastMode?: boolean;
  cursorResumeSessionId?: string;
  kiroBinaryPath?: string;
  kiroEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Approval autonomy for interactive Kiro turns: `auto` adds
   * `--trust-all-tools` to the `acp` process arguments.
   */
  kiroApprovalMode?: "manual" | "auto";
  kiroResumeSessionId?: string;
  /**
   * In-turn subagents the task's agent may call, compiled by the host from
   * the agent's `canCall` list (`native-subagents.ts`). Set only for a task
   * that runs as an agent; the host drops any other value.
   */
  nativeSubagents?: import("@/lib/agents/native-subagents").NativeSubagentDefinition[];
  /**
   * Instructions of the Agent this task runs as (the main agent of the task),
   * compiled from its saved config by `src/lib/agents/compile.ts`. Claude and
   * Codex receive them on their instruction channel for the task's own turns
   * only; secondary read-only runs and utility queries never do. Cursor and
   * Kiro have no channel Stave controls, so intake prepends them to the first
   * message instead and reports them as instructed.
   */
  agentInstructions?: string;
  /** Host-owned opt-in for the assigned primary agent; caller values are dropped at turn entry. */
  nativePlanTools?: boolean;
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
