import type {
  BridgeEvent,
  ProviderResponderResult,
  ProviderSteerResponder,
  StreamTurnArgs,
} from "./types";
import type {
  ConnectedToolId,
  ConnectedToolStatusEntry,
  ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";
import type {
  CodexAppServerSnapshot,
  CodexAppServerSnapshotResponse,
  CodexExternalAgentConfigMigrationItem,
  CodexModelCatalogResponse,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginInstallResponse,
  CodexPluginMarketplaceSnapshot,
  CodexRateLimitSnapshot,
  CodexReviewStartResponse,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
} from "../../src/lib/providers/provider.types";
import {
  buildCodexCliEnv,
  resolveCodexCliExecutablePath,
} from "./cli-path-env";
import { createTurnDiffTracker } from "./turn-diff-tracker";
import { toText } from "./utils";
import {
  buildProviderTurnPrompt,
  filterPromptRetrievedContext,
  getProviderNativeSlashCommandInput,
  resolveProviderResumeSessionId,
} from "../../src/lib/providers/provider-request-translators";
import {
  buildIntentGuardPrompt,
  buildReviewDiffPrompt,
  parseReviewFindings,
  PRE_PR_REVIEW_OUTPUT_SCHEMA,
  type PrePrReviewFinding,
} from "../../src/lib/source-control-review";
import { parsePullRequestSuggestionResponse } from "../../src/lib/source-control-pr";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import {
  appendBoundedText,
  createBoundedBridgeEventCollector,
  measureBridgeEventBytes,
  truncateBufferedText,
} from "./provider-buffering";
import { byteLengthUtf8 } from "../shared/bounded-text";
import { Utf8LineBuffer } from "../shared/utf8-line-buffer";
import {
  getConnectedToolLabel,
  normalizeConnectedToolIds,
  pickConnectedToolServer,
} from "../../src/lib/providers/connected-tool-status";
import { getCodexMcpRegistrationStatus } from "../main/codex-mcp";
import { readPrimaryStaveLocalMcpManifest } from "../main/stave-local-mcp-manifest";
import { resolveBoundSecretEnv } from "../main/browser/secret-service";
import { buildCodexInstructionProfileKey, resolveCodexWorkerProfile } from "./codex-runtime-config";
import { buildWorkerExecutionMetadata, type WorkerExecutionMetadata } from "../../src/lib/providers/worker-mode";
import {
  getCodexMcpConfigPathGroups,
  McpConfigRefreshTracker,
} from "./mcp-config-refresh";
import {
  registerPendingCodexAppServerResponse,
  rejectAllPendingCodexAppServerResponses,
  takePendingCodexAppServerResponse,
  type PendingCodexAppServerResponse,
} from "./codex-app-server-pending-request";
import {
  buildCodexTurnSteerParams,
  CODEX_STEER_REQUEST_TIMEOUT_MS,
} from "./codex-app-server-steer";
import { mapCodexThreadForkResponse } from "./codex-thread-actions";
import { isRecord, toTrimmedString } from "./codex-app-server-json";
import { DEFAULT_READ_ONLY_PROMPT_LABEL } from "./read-only-prompt-labels";
import {
  toCodexUserFacingErrorMessage,
  toErrorMessage,
} from "./codex-app-server-errors";
import {
  runCodexReadOnlyPromptWithClient,
  type CodexReadOnlyPromptArgs,
  type CodexReadOnlyPromptResult,
} from "./codex-read-only-prompt";
import { resolveGitHeadRef } from "./git-head-ref";
import {
  buildCodexGoalStatusEvent,
  normalizeCodexThreadGoal,
  readCodexGoalStatusEvent,
  runCodexCompactSlashCommand,
  runCodexGoalSlashCommand,
} from "./codex-goal-commands";
import {
  mapCodexConfigSnapshot,
  mapCodexHookCatalogGroups,
  mapCodexMcpStatusSnapshot,
  mapCodexModelCatalogEntry,
  mapCodexPluginDetail,
  mapCodexPluginSummary,
  mapCodexRateLimitBuckets,
  mapCodexSkillCatalogGroups,
  mapCodexThreadSnapshot,
} from "./codex-snapshot-mappers";
import {
  coerceElicitationAnswer,
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  shouldAutoApproveStaveLocalMcpElicitation,
  type ElicitationFieldDescriptor,
} from "./codex-elicitation-mapping";
import {
  buildBoundSecretFingerprint,
  buildCodexSecondaryServerRequestDenial,
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
  buildCodexTurnStartParams,
  buildSecretShellOverrides,
  deleteCodexSecondaryThread,
  resolveCodexSecondaryConfigOverrides,
  resolveCodexSecondaryRuntimeOptions,
} from "./codex-app-server-params";
import { mergeCodexTurnConfigOverrides } from "./codex-app-server-config-overrides";
import { parsePositiveIntEnv } from "./runtime-shared";
import { createCodexMcpManagement } from "./codex-mcp-management";
import {
  downgradeUnsupportedCodexRuntimeOptions,
  getCodexVersionCapabilities,
} from "./codex-runtime-capabilities";
import { mapCodexHookNotificationToBridgeEvent } from "./codex-hook-mapping";
import { createCodexAppServerElicitationPauseController } from "./codex-elicitation-pause";
import { createCodexWorkerActivityMapper } from "./codex-worker-activity";

// This module stays the public entry point for the Codex App Server runtime, so
// helpers that moved into sibling modules are re-exported here unchanged.
export { formatCodexAppServerErrorMessage } from "./codex-app-server-errors";
export {
  formatCodexGoal,
  isCodexCompactSlashCommand,
  mapCodexThreadGoalToProviderGoal,
  parseCodexGoalSlashCommand,
  runCodexCompactSlashCommand,
  runCodexGoalSlashCommand,
  type CodexGoalSlashCommand,
  type CodexThreadGoal,
  type CodexThreadGoalStatus,
} from "./codex-goal-commands";
export { toCodexConfigLayerDisplayValue } from "./codex-snapshot-mappers";
export {
  buildCodexConfigOverrides,
  buildCodexMcpDisableConfigOverrides,
  buildCodexSecondaryServerRequestDenial,
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
  buildCodexTurnStartParams,
  buildSandboxPolicy,
} from "./codex-app-server-params";
export { buildCodexUnattendedAutomationMcpOverrides } from "./codex-app-server-config-overrides";
export { applyCodexRuntimeCapabilityDowngrades } from "./codex-runtime-capabilities";
export { mapCodexHookNotificationToBridgeEvent } from "./codex-hook-mapping";
export { createCodexAppServerElicitationPauseController } from "./codex-elicitation-pause";
export {
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  shouldAutoApproveStaveLocalMcpElicitation,
} from "./codex-elicitation-mapping";

const threadIdByTask = new Map<string, string>();
const threadExecutableByTask = new Map<string, string>();
const clientByExecutablePath = new Map<string, CodexAppServerClient>();
const codexGlobalMcpConfigRefreshTracker = new McpConfigRefreshTracker();
const codexProjectMcpConfigRefreshTracker = new McpConfigRefreshTracker();
const freshCodexThreadExecutables = new Set<string>();
const activeCodexTurnsByExecutable = new Map<string, number>();
const pendingMcpRefreshExecutables = new Set<string>();
const APP_SERVER_INTERRUPT_GRACE_MS = 10_000;
const CODEX_CONFIG_READ_TIMEOUT_MS = 5_000;

/**
 * How long a Codex approval / user-input request can sit unanswered before
 * Stave auto-declines it. Mirrors Claude's
 * `CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS` (claude-sdk-runtime.ts):
 * without an equivalent fallback here, a dropped or never-delivered Codex
 * approval/user-input prompt (renderer never rendered it, IPC glitch, user
 * simply never responds) leaves the per-turn timeout controller paused
 * indefinitely (see `createTurnTimeoutController` in `runtime.ts`, which only
 * releases a decision's pause on that request's responder delivery, a
 * `tool_result` matching its id, or an `error` bridge event) — the turn, and
 * its task/workspace, would then show "active" forever.
 */
export const CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS = 45 * 60 * 1000;

export function resolveCodexApprovalDecisionTimeoutMs(args: {
  envValue?: string;
  override?: number;
}) {
  if (typeof args.override === "number" && Number.isFinite(args.override)) {
    return Math.max(0, Math.floor(args.override));
  }
  return parsePositiveIntEnv({
    value: args.envValue,
    fallback: CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  });
}

const CODEX_APP_SERVER_STDOUT_BUFFER_MAX_BYTES = 64 * 1024 * 1024;
const CODEX_APP_SERVER_STDOUT_SOFT_LINE_MAX_BYTES = 1 * 1024 * 1024;
const CODEX_APP_SERVER_STDOUT_HARD_LINE_MAX_BYTES = 32 * 1024 * 1024;
const CODEX_APP_SERVER_COLLECTED_EVENTS_MAX_BYTES = 512 * 1024;
const CODEX_APP_SERVER_MESSAGE_BUFFER_MAX_BYTES = 256 * 1024;
const CODEX_APP_SERVER_PLAN_BUFFER_MAX_BYTES = 128 * 1024;
const CODEX_APP_SERVER_TOOL_OUTPUT_BUFFER_MAX_BYTES = 256 * 1024;
const CODEX_APP_SERVER_PARTIAL_TOOL_OUTPUT_MAX_BYTES = 128 * 1024;
const CODEX_APP_SERVER_FINAL_TOOL_OUTPUT_MAX_BYTES = 256 * 1024;
const CODEX_APP_SERVER_PLAN_EVENT_MAX_BYTES = 64 * 1024;
const CODEX_APP_SERVER_PARTIAL_PLAN_EMIT_THROTTLE_MS = 80;
const CODEX_APP_SERVER_PARTIAL_TOOL_EMIT_THROTTLE_MS = 200;
const CODEX_APP_SERVER_OVERFLOW_TAIL_EVENTS: BridgeEvent[] = [
  {
    type: "error",
    message:
      "Codex App Server turn output was truncated in non-stream replay because the retained snapshot limit was exceeded.",
    recoverable: true,
  },
  { type: "done", stop_reason: "output_overflow" },
];
const CODEX_APP_SERVER_OVERFLOW_TAIL_BYTES =
  CODEX_APP_SERVER_OVERFLOW_TAIL_EVENTS.reduce(
    (total, event) => total + measureBridgeEventBytes(event),
    0,
  );

type JsonRpcId = string | number;
type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

type CodexAppServerAuthMode = "apikey" | "chatgpt" | "chatgptAuthTokens" | null;

type CodexGetAuthStatusResponse = {
  authMethod?: CodexAppServerAuthMode;
  authToken?: string | null;
  requiresOpenaiAuth?: boolean | null;
};

type CodexAccountReadResponse = {
  account?: {
    type?: string;
    planType?: string | null;
  } | null;
  requiresOpenaiAuth?: boolean;
};

type CodexChatgptAuthTokensRefreshParams = {
  reason?: "unauthorized";
  previousAccountId?: string | null;
};

type CodexChatgptAuthTokensRefreshResponse = {
  accessToken: string;
  chatgptAccountId: string;
  chatgptPlanType: string | null;
};

type ServerRequestMethod =
  | "item/commandExecution/requestApproval"
  | "item/fileChange/requestApproval"
  | "item/permissions/requestApproval"
  | "item/tool/requestUserInput"
  | "mcpServer/elicitation/request"
  | "applyPatchApproval"
  | "execCommandApproval"
  | "item/tool/call"
  | "account/chatgptAuthTokens/refresh";

interface PendingApprovalRequest {
  serverRequestId: JsonRpcId;
  responseKind:
    | "review"
    | "commandExecution"
    | "fileChange"
    | "permissions"
    | "elicitation";
  permissions?: {
    network?: unknown;
    fileSystem?: unknown;
  } | null;
}

interface PendingUserInputRequest {
  serverRequestId: JsonRpcId;
  responseKind: "tool" | "elicitation";
  elicitationMode?: "form" | "url";
  elicitationFields?: ElicitationFieldDescriptor[];
}

interface CodexMcpServerStatus {
  name: string;
  authStatus?: string | null;
}

function buildCodexEnv(args: { executablePath?: string } = {}) {
  return buildCodexCliEnv({ executablePath: args.executablePath });
}

function decodeJwtPayload(token: string) {
  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length < 2 || !parts[1]) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(normalized + padding, "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getJwtClaimRecord(args: {
  payload: Record<string, unknown> | null;
  key: string;
}) {
  const value = args.payload?.[args.key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function resolveCodexChatgptAuthTokensRefreshResponse(args: {
  authStatus: CodexGetAuthStatusResponse;
  accountStatus: CodexAccountReadResponse;
  previousAccountId?: string | null;
}): CodexChatgptAuthTokensRefreshResponse | null {
  const authMethod = args.authStatus.authMethod ?? null;
  if (authMethod !== "chatgpt" && authMethod !== "chatgptAuthTokens") {
    return null;
  }

  const accessToken = args.authStatus.authToken?.trim();
  if (!accessToken) {
    return null;
  }

  const payload = decodeJwtPayload(accessToken);
  const authClaims = getJwtClaimRecord({
    payload,
    key: "https://api.openai.com/auth",
  });
  const chatgptAccountId =
    typeof authClaims?.chatgpt_account_id === "string"
      ? authClaims.chatgpt_account_id.trim()
      : "";
  if (!chatgptAccountId) {
    return null;
  }

  const planTypeFromClaims =
    typeof authClaims?.chatgpt_plan_type === "string"
      ? authClaims.chatgpt_plan_type
      : null;
  const planTypeFromAccount =
    typeof args.accountStatus.account?.planType === "string"
      ? args.accountStatus.account.planType
      : null;

  return {
    accessToken,
    chatgptAccountId,
    chatgptPlanType: planTypeFromAccount ?? planTypeFromClaims,
  };
}

async function refreshCodexChatgptAuthTokens(args: {
  executablePath: string;
  previousAccountId?: string | null;
}) {
  const client = new CodexAppServerClient(args.executablePath);
  try {
    const [authStatus, accountStatus] = await Promise.all([
      client.request<CodexGetAuthStatusResponse>("getAuthStatus", {
        includeToken: true,
        refreshToken: true,
      }),
      client.request<CodexAccountReadResponse>("account/read", {
        refreshToken: true,
      }),
    ]);

    const response = resolveCodexChatgptAuthTokensRefreshResponse({
      authStatus,
      accountStatus,
      previousAccountId: args.previousAccountId,
    });
    if (!response) {
      throw new Error(
        "Codex ChatGPT token refresh requires an active ChatGPT login with a refreshable access token.",
      );
    }
    return response;
  } finally {
    client.dispose("Closed temporary Codex auth refresh client.");
  }
}

async function hasConnectedStaveLocalMcpForCodex() {
  const manifest = await readPrimaryStaveLocalMcpManifest();
  if (!manifest) {
    return false;
  }
  const status = await getCodexMcpRegistrationStatus({
    autoRegister: false,
    manifest,
  });
  return status.installed && status.matchesCurrentManifest;
}

function appendBoundedCodexBuffer(args: {
  current: string;
  chunk: string;
  keep: "prefix" | "suffix";
  maxBytes: number;
}) {
  return appendBoundedText({
    current: args.current,
    chunk: args.chunk,
    keep: args.keep,
    maxBytes: args.maxBytes,
  });
}

function truncateCodexSnapshot(args: { value: string; maxBytes: number }) {
  return truncateBufferedText({
    value: args.value,
    maxBytes: args.maxBytes,
  });
}

type CodexMcpToolCallItem = {
  id?: string;
  type?: string;
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: unknown;
  error?: { message?: string | null } | null;
  status?: string;
};

function serializeCodexMcpToolCallArguments(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return toText(value ?? {});
  }
}

function buildCodexMcpToolCallInputEvent(
  item: CodexMcpToolCallItem,
  workerExecution?: WorkerExecutionMetadata | null,
): Extract<BridgeEvent, { type: "tool" }> {
  const itemId = typeof item.id === "string" ? item.id : "";
  const normalizedToolName = `${item.server ?? "mcp"}:${item.tool ?? "tool"}`
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
  return {
    type: "tool",
    ...(itemId ? { toolUseId: itemId } : {}),
    toolName: `${item.server ?? "mcp"}:${item.tool ?? "tool"}`,
    input: truncateCodexSnapshot({
      value: serializeCodexMcpToolCallArguments(item.arguments),
      maxBytes: CODEX_APP_SERVER_TOOL_OUTPUT_BUFFER_MAX_BYTES,
    }),
    state: "input-available",
    ...(workerExecution && normalizedToolName.endsWith("spawnagent")
      ? { workerExecution }
      : {}),
  };
}

/**
 * Extracts safe JSON-RPC envelope metadata (method, item type/id) from the
 * leading characters of a dropped oversized stdout line. Never returns
 * payload content — diagnostics only.
 */
export function describeJsonRpcLinePrefix(linePrefix: string) {
  const method = /"method"\s*:\s*"([^"]{1,128})"/.exec(linePrefix)?.[1];
  const itemType = /"item"\s*:\s*\{[^{}]*?"type"\s*:\s*"([^"]{1,64})"/.exec(
    linePrefix,
  )?.[1];
  const itemId = /"item"\s*:\s*\{[^{}]*?"id"\s*:\s*"([^"]{1,128})"/.exec(
    linePrefix,
  )?.[1];
  // For responses ({"jsonrpc":"2.0","id":5,"result":...}) the first "id" is
  // the envelope id. Only trust it when no "method" is present (i.e. this is
  // a response, not a notification whose first "id" may belong to an item).
  let responseId: number | string | null = null;
  if (!method) {
    const idMatch = /"id"\s*:\s*(?:(\d+)|"([^"]{1,128})")/.exec(linePrefix);
    if (idMatch) {
      responseId = idMatch[1] !== undefined ? Number(idMatch[1]) : idMatch[2]!;
    }
  }
  return {
    method: method ?? null,
    itemType: itemType ?? null,
    itemId: itemId ?? null,
    responseId,
  };
}

function buildThreadKey(args: {
  taskId?: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  boundSecretFingerprint?: string;
}) {
  const model = args.runtimeOptions?.model?.trim() || "default";
  const mode = args.runtimeOptions?.codexPlanMode ? "plan" : "chat";
  const instructionProfile = buildCodexInstructionProfileKey({
    runtimeOptions: args.runtimeOptions,
  });
  const secretFingerprint = args.boundSecretFingerprint ?? "none";
  return `${args.taskId ?? "default"}:${args.cwd}:${model}:${mode}:${instructionProfile}:${secretFingerprint}`;
}

function resolveThreadId(args: {
  threadKey: string;
  executablePath: string;
  fallbackThreadId?: string;
}) {
  return threadExecutableByTask.get(args.threadKey) === args.executablePath
    ? (threadIdByTask.get(args.threadKey) ?? args.fallbackThreadId?.trim())
    : args.fallbackThreadId?.trim();
}

function rememberThreadId(args: {
  threadKey: string;
  threadId?: string;
  executablePath: string;
}) {
  const nextThreadId = args.threadId?.trim();
  if (!nextThreadId) {
    return;
  }
  threadIdByTask.set(args.threadKey, nextThreadId);
  threadExecutableByTask.set(args.threadKey, args.executablePath);
}

function resolveCodexResumeThreadFallback(args: {
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  return resolveProviderResumeSessionId({
    conversation: args.conversation,
    fallbackResumeId: args.runtimeOptions?.codexResumeThreadId,
  });
}

function buildCodexThreadStartedEvents(args: {
  threadId?: string;
}): BridgeEvent[] {
  const threadId = args.threadId?.trim();
  if (!threadId) {
    return [];
  }
  return [
    {
      type: "provider_session",
      providerId: "codex",
      nativeSessionId: threadId,
    },
  ];
}

export function resolveCodexExecutablePath(
  args: { explicitPath?: string } = {},
) {
  return resolveCodexCliExecutablePath({
    explicitPath: args.explicitPath,
  });
}

function buildApprovalDescription(args: {
  method: ServerRequestMethod;
  params: Record<string, unknown>;
}) {
  const reason =
    typeof args.params.reason === "string" &&
    args.params.reason.trim().length > 0
      ? args.params.reason.trim()
      : null;
  if (
    typeof args.params.command === "string" &&
    args.params.command.trim().length > 0
  ) {
    return reason ? `${args.params.command}\n\n${reason}` : args.params.command;
  }
  if (args.method === "item/fileChange/requestApproval") {
    const grantRoot =
      typeof args.params.grantRoot === "string"
        ? args.params.grantRoot.trim()
        : "";
    if (grantRoot) {
      return reason
        ? `${reason}\n\nGrant root: ${grantRoot}`
        : `Grant root: ${grantRoot}`;
    }
  }
  return reason ?? `Codex requested approval for ${args.method}.`;
}

function buildApprovalInput(args: { params: Record<string, unknown> }) {
  return typeof args.params.command === "string" &&
    args.params.command.trim().length > 0
    ? args.params.command.trim()
    : undefined;
}

function mapApprovalToolName(method: ServerRequestMethod) {
  switch (method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
      return "bash";
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return "apply_patch";
    case "item/permissions/requestApproval":
      return "permissions";
    default:
      return method;
  }
}

function mapUserInputQuestions(questions: Array<Record<string, unknown>>) {
  return questions.map((question) => ({
    header: typeof question.header === "string" ? question.header : "",
    key: typeof question.key === "string" ? question.key : undefined,
    question: typeof question.question === "string" ? question.question : "",
    multiSelect: false,
    inputType: "text" as const,
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({
          label: typeof option?.label === "string" ? option.label : "",
          description:
            typeof option?.description === "string" ? option.description : "",
        }))
      : [],
  }));
}

function shouldDebugCodexAppServerMessage(message: JsonRpcMessage) {
  return (
    message.method === "error" ||
    message.method === "turn/started" ||
    message.method === "turn/completed"
  );
}

export function summarizeCodexAppServerDebugMessage(message: JsonRpcMessage) {
  const params = isRecord(message.params) ? message.params : null;
  const turn = params && isRecord(params.turn) ? params.turn : null;
  const item = params && isRecord(params.item) ? params.item : null;
  const turnError = turn && isRecord(turn.error) ? turn.error : null;

  return {
    id: Object.prototype.hasOwnProperty.call(message, "id")
      ? message.id
      : undefined,
    method: typeof message.method === "string" ? message.method : undefined,
    threadId:
      typeof params?.threadId === "string" ? params.threadId : undefined,
    turnId:
      typeof params?.turnId === "string"
        ? params.turnId
        : typeof turn?.id === "string"
          ? turn.id
          : undefined,
    status:
      typeof turn?.status === "string"
        ? turn.status
        : typeof item?.status === "string"
          ? item.status
          : undefined,
    errorMessage:
      extractCodexAppServerErrorMessage(params) ??
      (typeof turnError?.message === "string" ? turnError.message : undefined),
  };
}

function extractCodexAppServerErrorMessage(
  params: Record<string, unknown> | null,
) {
  if (!params) {
    return null;
  }
  const directMessage = toTrimmedString(params.message);
  if (directMessage) {
    return directMessage;
  }
  const error = isRecord(params.error) ? params.error : null;
  if (!error) {
    return null;
  }
  const errorMessage = toTrimmedString(error.message);
  if (errorMessage) {
    return errorMessage;
  }
  const nestedError = isRecord(error.error) ? error.error : null;
  return toTrimmedString(nestedError?.message);
}

/** Lower is better — see `pickConnectedToolServer`. */
const CODEX_MCP_AUTH_STATUS_RANK: Record<string, number> = {
  oAuth: 0,
  bearerToken: 0,
  notLoggedIn: 1,
  unsupported: 2,
};

function mapCodexMcpServerStatus(args: {
  toolId: ConnectedToolId;
  servers: CodexMcpServerStatus[];
}) {
  const server = pickConnectedToolServer({
    toolId: args.toolId,
    servers: args.servers,
    rank: (candidate) =>
      CODEX_MCP_AUTH_STATUS_RANK[candidate.authStatus ?? ""] ?? 99,
  });
  if (!server) {
    return createCodexConnectedToolStatusEntry({
      id: args.toolId,
      state: "unsupported",
      available: false,
      detail: `${getConnectedToolLabel(args.toolId)} is not configured for Codex.`,
    });
  }

  switch (server.authStatus) {
    case "oAuth":
    case "bearerToken":
      return createCodexConnectedToolStatusEntry({
        id: args.toolId,
        state: "ready",
        available: true,
        detail: `${getConnectedToolLabel(args.toolId)} is ready for Codex via "${server.name}".`,
      });
    case "notLoggedIn":
      return createCodexConnectedToolStatusEntry({
        id: args.toolId,
        state: "needs-auth",
        available: false,
        detail: `${getConnectedToolLabel(args.toolId)} needs authentication in Codex.`,
      });
    case "unsupported":
    default:
      return createCodexConnectedToolStatusEntry({
        id: args.toolId,
        state: "unknown",
        available: true,
        detail: `${getConnectedToolLabel(args.toolId)} auth state is ${server.authStatus ?? "unknown"} in Codex.`,
      });
  }
}

function createCodexConnectedToolStatusEntry(args: {
  id: ConnectedToolId;
  state: ConnectedToolStatusEntry["state"];
  available: boolean;
  detail: string;
}) {
  return {
    id: args.id,
    label: getConnectedToolLabel(args.id),
    state: args.state,
    available: args.available,
    detail: args.detail,
  } satisfies ConnectedToolStatusEntry;
}

class CodexAppServerClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private processStartedAt: number | null = null;
  private startupPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private pendingResponses = new Map<
    JsonRpcId,
    PendingCodexAppServerResponse
  >();
  private listeners = new Set<(message: JsonRpcMessage) => void>();
  private exitListeners = new Set<(message: string) => void>();
  private initialized = false;
  private lastErrorMessage: string | null = null;
  constructor(
    private readonly executablePath: string,
    private readonly secretEnv: Record<string, string> = {},
  ) {}

  async ensureStarted() {
    if (this.process && this.initialized) {
      return;
    }
    if (this.startupPromise) {
      return this.startupPromise;
    }
    this.startupPromise = this.start();
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  subscribe(listener: (message: JsonRpcMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onProcessExit(listener: (message: string) => void) {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  async request<T = unknown>(
    method: string,
    params: unknown,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    await this.ensureStarted();
    return this.sendRequest<T>(method, params, options);
  }

  async respond(requestId: JsonRpcId, result: unknown) {
    await this.ensureStarted();
    this.process?.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        result,
      }) + "\n",
    );
  }

  async respondError(
    requestId: JsonRpcId,
    error: { code: number; message: string; data?: unknown },
  ) {
    await this.ensureStarted();
    this.process?.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        error,
      }) + "\n",
    );
  }

  getLastErrorMessage() {
    return this.lastErrorMessage;
  }

  getProcessStartedAt() {
    return this.processStartedAt;
  }

  dispose(message = "Codex App Server closed.") {
    if (!this.process) {
      this.lastErrorMessage = message;
      return;
    }
    this.teardownProcess(message);
  }

  private async start() {
    if (this.process) {
      this.teardownProcess("Restarting Codex App Server.");
    }

    const processStartedAt = Date.now();
    const child = spawn(
      this.executablePath,
      ["app-server", "--listen", "stdio://"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...buildCodexEnv({ executablePath: this.executablePath }),
          ...this.secretEnv,
        },
        cwd: process.cwd(),
      },
    );
    this.process = child;
    this.processStartedAt = processStartedAt;
    this.initialized = false;
    const stdoutLineBuffer = new Utf8LineBuffer({
      label: "codex-app-server stdout",
      maxBufferBytes: CODEX_APP_SERVER_STDOUT_BUFFER_MAX_BYTES,
      maxLineBytes: CODEX_APP_SERVER_STDOUT_HARD_LINE_MAX_BYTES,
      // Drop oversized lines without taking down unrelated shared sessions.
      // Log only size and JSON-RPC envelope metadata, never payload content.
      onOversizedLine: ({ lineBytes, linePrefix }) => {
        const described = describeJsonRpcLinePrefix(linePrefix);
        console.warn(
          "[codex-app-server-runtime] dropped oversized stdout line",
          {
            lineBytes,
            maxLineBytes: CODEX_APP_SERVER_STDOUT_HARD_LINE_MAX_BYTES,
            ...described,
          },
        );
        // Reject a dropped pending response instead of waiting for its deadline.
        if (described.responseId !== null) {
          const pending = takePendingCodexAppServerResponse({
            pendingResponses: this.pendingResponses,
            requestId: described.responseId,
          });
          if (pending) {
            pending.reject(
              new Error(
                `Codex App Server response was dropped: oversized line (${lineBytes} bytes) exceeded ${CODEX_APP_SERVER_STDOUT_HARD_LINE_MAX_BYTES} bytes.`,
              ),
            );
          }
        }
      },
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (child !== this.process) {
        return;
      }
      let lines: string[];
      try {
        lines = stdoutLineBuffer.append(chunk);
      } catch (error) {
        this.teardownProcess(
          error instanceof Error ? error.message : String(error),
        );
        return;
      }
      for (const line of lines) {
        if (line.length === 0) {
          continue;
        }
        if (!this.handleProtocolLine(line)) {
          return;
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (text.trim().length > 0) {
        this.lastErrorMessage = text.trim();
      }
    });

    child.once("exit", (_code, signal) => {
      this.teardownProcess(
        signal
          ? `Codex App Server exited with signal ${signal}.`
          : "Codex App Server exited.",
      );
    });

    await this.sendRequest("initialize", {
      clientInfo: {
        name: "stave",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "initialized",
        params: {},
      }) + "\n",
    );
    this.initialized = true;
  }

  private async sendRequest<T = unknown>(
    method: string,
    params: unknown,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    const child = this.process;
    if (!child) {
      throw new Error("Codex App Server is not running.");
    }

    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      registerPendingCodexAppServerResponse({
        pendingResponses: this.pendingResponses,
        requestId,
        method,
        timeoutMs: options?.timeoutMs,
        resolve,
        reject,
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method,
          params,
        }) + "\n",
      );
    });
  }

  private handleMessage(line: string) {
    const message = this.parseMessage(line);
    if (!message) {
      return;
    }
    this.dispatchMessage(message);
  }

  private parseMessage(line: string) {
    try {
      return JSON.parse(line) as JsonRpcMessage;
    } catch {
      return null;
    }
  }

  private handleProtocolLine(line: string) {
    const lineBytes = byteLengthUtf8(line);
    if (lineBytes > CODEX_APP_SERVER_STDOUT_SOFT_LINE_MAX_BYTES) {
      const message = this.parseMessage(line);
      if (!message) {
        this.teardownProcess(
          `Codex App Server protocol overflow: oversized line (${lineBytes} bytes) was not valid JSON-RPC.`,
        );
        return false;
      }
      this.dispatchMessage(message);
      return true;
    }
    this.handleMessage(line);
    return true;
  }

  private dispatchMessage(message: JsonRpcMessage) {
    codexMcpManagement.captureNotification(this.executablePath, message);
    const hasResponseId =
      Object.prototype.hasOwnProperty.call(message, "id") &&
      (Object.prototype.hasOwnProperty.call(message, "result") ||
        Object.prototype.hasOwnProperty.call(message, "error"));
    if (hasResponseId) {
      const id = message.id as JsonRpcId;
      const pending = takePendingCodexAppServerResponse({
        pendingResponses: this.pendingResponses,
        requestId: id,
      });
      if (!pending) {
        return;
      }
      if (message.error) {
        pending.reject(
          new Error(
            message.error.message || "Codex App Server request failed.",
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private teardownProcess(message: string) {
    const current = this.process;
    this.process = null;
    this.processStartedAt = null;
    this.initialized = false;
    this.lastErrorMessage = message;
    if (current && !current.killed) {
      current.kill();
    }
    rejectAllPendingCodexAppServerResponses({
      pendingResponses: this.pendingResponses,
      error: new Error(message),
    });

    // Notify turn-level listeners so waitForTurnCompletion resolves.
    for (const listener of this.exitListeners) {
      try {
        listener(message);
      } catch {
        // Swallow — listener errors must not break teardown.
      }
    }
    this.exitListeners.clear();
  }
}

function getCodexAppServerClient(args: { executablePath: string }) {
  const executablePath = args.executablePath.trim();
  const existing = clientByExecutablePath.get(executablePath);
  if (existing) {
    return existing;
  }
  const client = new CodexAppServerClient(executablePath);
  clientByExecutablePath.set(executablePath, client);
  return client;
}

function restartCodexAppServerForMcpConfigChange(executablePath: string) {
  clientByExecutablePath
    .get(executablePath)
    ?.dispose("Restarting Codex App Server after MCP configuration change.");
  clientByExecutablePath.delete(executablePath);
  for (const [threadKey, threadExecutablePath] of threadExecutableByTask) {
    if (threadExecutablePath === executablePath) {
      threadIdByTask.delete(threadKey);
      threadExecutableByTask.delete(threadKey);
    }
  }
  freshCodexThreadExecutables.add(executablePath);
}

async function resolveCodexMcpConfigPathGroups(args: {
  client: CodexAppServerClient;
  cwd: string;
  codexHome?: string;
}) {
  let configLayers: unknown[] = [];
  try {
    const response = await args.client.request<{ layers?: unknown[] }>(
      "config/read",
      {
        includeLayers: true,
        cwd: args.cwd,
      },
      { timeoutMs: CODEX_CONFIG_READ_TIMEOUT_MS },
    );
    configLayers = Array.isArray(response.layers) ? response.layers : [];
  } catch {
    // Keep static path fallbacks when config/read is unavailable.
  }
  return getCodexMcpConfigPathGroups({
    cwd: args.cwd,
    codexHome: args.codexHome,
    configLayers,
  });
}

function finishCodexTurn(
  executablePath: string,
  transientClient?: CodexAppServerClient | null,
) {
  transientClient?.dispose("Closed secret-bound Codex App Server.");
  const activeTurns =
    (activeCodexTurnsByExecutable.get(executablePath) ?? 1) - 1;
  if (activeTurns > 0) {
    activeCodexTurnsByExecutable.set(executablePath, activeTurns);
    return;
  }
  activeCodexTurnsByExecutable.delete(executablePath);
  if (pendingMcpRefreshExecutables.delete(executablePath)) {
    restartCodexAppServerForMcpConfigChange(executablePath);
  }
}

async function ensureCodexThread(args: {
  client: CodexAppServerClient;
  executablePath: string;
  taskId?: string;
  cwd: string;
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  ephemeral?: boolean;
  configOverrides?: Record<string, string | boolean>;
  boundSecretFingerprint?: string;
  /**
   * A secondary read-only run must not delegate to a Worker-mode subagent: it is
   * a bounded analysis pass, and a worker would escape both its turn budget and
   * its read-only contract. Mirrors the Claude adapter's gate.
   */
  secondaryReadOnly?: boolean;
}) {
  const threadKey = buildThreadKey({
    taskId: args.taskId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
    boundSecretFingerprint: args.boundSecretFingerprint,
  });
  const resumeThreadId = args.ephemeral
    ? undefined
    : resolveThreadId({
        threadKey,
        executablePath: args.executablePath,
        fallbackThreadId: freshCodexThreadExecutables.has(args.executablePath)
          ? undefined
          : resolveCodexResumeThreadFallback({
              conversation: args.conversation,
              runtimeOptions: args.runtimeOptions,
            }),
      });

  const response = resumeThreadId
    ? await args.client.request<{ thread: { id: string } }>("thread/resume", {
        ...buildCodexThreadResumeParams({
          threadId: resumeThreadId,
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
          // Forward caller config overrides on resume too. Previously dropped
          // here, which silently discarded MCP-isolation and injected-secret
          // shell env whenever a thread resumed instead of starting fresh.
          configOverrides: args.configOverrides,
          ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
        }),
      })
    : await args.client.request<{ thread: { id: string } }>(
        "thread/start",
        buildCodexThreadStartParams({
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
          ...(args.ephemeral
            ? {
                ephemeral: true,
                sandbox: "read-only" as const,
                approvalPolicy: "never" as const,
              }
            : {}),
          configOverrides: args.configOverrides,
          ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
        }),
      );
  const threadId = response.thread.id;
  if (!args.ephemeral) {
    rememberThreadId({
      threadKey,
      threadId,
      executablePath: args.executablePath,
    });
  }
  return {
    threadId,
    threadKey,
    resumedThreadId: resumeThreadId ?? null,
  };
}

export function cleanupCodexAppServerTask(taskId: string) {
  const keyPrefix = `${taskId}:`;
  for (const threadKey of threadIdByTask.keys()) {
    if (threadKey.startsWith(keyPrefix)) {
      threadIdByTask.delete(threadKey);
      threadExecutableByTask.delete(threadKey);
    }
  }
}

function getCodexAppServerClientFromRuntimeOptions(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
  });
  if (!executablePath) {
    throw new Error("Codex executable not found.");
  }
  return getCodexAppServerClient({
    executablePath,
  });
}

const codexMcpManagement = createCodexMcpManagement({
  resolveExecutablePath: resolveCodexExecutablePath,
  getClient: getCodexAppServerClient,
  formatError: toCodexUserFacingErrorMessage,
});

export const getCodexMcpRuntimeStatus = codexMcpManagement.getRuntimeStatus;
export const startCodexMcpOauthLogin = codexMcpManagement.startOauthLogin;
export const readCodexMcpResource = codexMcpManagement.readResource;
export const listCodexMcpServerConfigs = codexMcpManagement.listConfigs;
export const previewCodexMcpServerConfigMutation =
  codexMcpManagement.previewConfigMutation;
export const applyCodexMcpServerConfigMutation =
  codexMcpManagement.applyConfigMutation;

async function listPaginatedCodexData<T>(args: {
  client: CodexAppServerClient;
  method: string;
  params?: Record<string, unknown>;
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = args.maxPages ?? 10;
  while (pages < maxPages) {
    // Checked per page rather than only up front: a sweep can run for up to
    // `maxPages` round trips, and a caller that has already been cancelled
    // should not keep paying for the rest of them.
    if (args.signal?.aborted) {
      break;
    }
    const response = await args.client.request<{
      data?: T[];
      nextCursor?: string | null;
    }>(args.method, {
      ...(args.params ?? {}),
      ...(cursor ? { cursor } : {}),
    });
    results.push(...(response.data ?? []));
    cursor = response.nextCursor ?? null;
    pages += 1;
    if (!cursor) {
      break;
    }
  }
  return results;
}

export async function getCodexModelCatalog(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  /**
   * Stops the paginated sweep when the caller has already been cancelled. The
   * Advisor preflight passes its abort signal here; without it the sweep kept
   * running after the turn was gone.
   */
  signal?: AbortSignal;
}): Promise<CodexModelCatalogResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const models = await listPaginatedCodexData<any>({
      client,
      method: "model/list",
      params: {
        includeHidden: false,
        limit: 100,
      },
      ...(args.signal ? { signal: args.signal } : {}),
    });
    return {
      ok: true,
      detail: "Loaded Codex model catalog from App Server.",
      models: models.map(mapCodexModelCatalogEntry),
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
      models: [],
    };
  }
}

async function requestCodexRateLimitBuckets(
  client: ReturnType<typeof getCodexAppServerClientFromRuntimeOptions>,
): Promise<CodexRateLimitSnapshot[]> {
  const response = await client.request<any>("account/rateLimits/read", {});
  return mapCodexRateLimitBuckets(response);
}

/**
 * Lightweight rate-limit-only fetch for the global status bar. Avoids the
 * heavy `getCodexAppServerSnapshot` call (account/skills/plugins/threads/...)
 * so it can be polled on a short interval.
 */
export async function fetchCodexRateLimitBuckets(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexRateLimitSnapshot[]> {
  const client = getCodexAppServerClientFromRuntimeOptions(args);
  return requestCodexRateLimitBuckets(client);
}

export async function getCodexAppServerSnapshot(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexAppServerSnapshotResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const cwd = args.cwd?.trim() || process.cwd();
    const executablePath = resolveCodexExecutablePath({
      explicitPath: args.runtimeOptions?.codexBinaryPath,
    });
    const capabilities = executablePath
      ? getCodexVersionCapabilities(executablePath)
      : null;
    const snapshot: CodexAppServerSnapshot = {
      account: null,
      rateLimits: [],
      skills: [],
      hooks: [],
      pluginMarketplaces: [],
      plugins: [],
      pluginMarketplaceLoadErrors: [],
      apps: [],
      experimentalFeatures: [],
      mcpServers: [],
      threads: [],
      archivedThreads: [],
      config: null,
      configRequirements: null,
      externalAgentConfigItems: [],
    };
    const sectionErrors: Record<string, string> = {};
    let loadedSectionCount = 0;

    const loadSection = async (key: string, loader: () => Promise<void>) => {
      try {
        await loader();
        loadedSectionCount += 1;
      } catch (error) {
        sectionErrors[key] = toCodexUserFacingErrorMessage({
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    await Promise.all([
      loadSection("account", async () => {
        const response = await client.request<any>("account/read", {
          refreshToken: false,
        });
        const account = response?.account;
        snapshot.account = {
          type: typeof account?.type === "string" ? account.type : "unknown",
          email: typeof account?.email === "string" ? account.email : null,
          planType:
            typeof account?.planType === "string" ? account.planType : null,
          requiresOpenaiAuth: Boolean(response?.requiresOpenaiAuth),
        };
      }),
      loadSection("rateLimits", async () => {
        snapshot.rateLimits = await requestCodexRateLimitBuckets(client);
      }),
      loadSection("skills", async () => {
        const response = await client.request<any>("skills/list", {
          cwds: [cwd],
          forceReload: false,
        });
        snapshot.skills = mapCodexSkillCatalogGroups(response?.data, cwd);
      }),
      ...(capabilities?.hooks.inventory
        ? [
            loadSection("hooks", async () => {
              const response = await client.request<any>("hooks/list", {
                cwds: [cwd],
              });
              snapshot.hooks = mapCodexHookCatalogGroups(response?.data, cwd);
            }),
          ]
        : []),
      loadSection("plugins", async () => {
        const response = await client.request<any>("plugin/list", {
          cwds: [cwd],
          forceRemoteSync: false,
        });
        snapshot.pluginMarketplaces = Array.isArray(response?.marketplaces)
          ? response.marketplaces.map(
              (marketplace: any): CodexPluginMarketplaceSnapshot => ({
                name: String(marketplace?.name ?? ""),
                path: String(marketplace?.path ?? ""),
                displayName:
                  typeof marketplace?.interface?.displayName === "string"
                    ? marketplace.interface.displayName
                    : null,
              }),
            )
          : [];
        snapshot.plugins = Array.isArray(response?.marketplaces)
          ? response.marketplaces.flatMap((marketplace: any) =>
              Array.isArray(marketplace?.plugins)
                ? marketplace.plugins.map((plugin: any) =>
                    mapCodexPluginSummary(plugin, marketplace),
                  )
                : [],
            )
          : [];
        snapshot.pluginMarketplaceLoadErrors = Array.isArray(
          response?.marketplaceLoadErrors,
        )
          ? response.marketplaceLoadErrors.map((error: any) =>
              typeof error?.message === "string"
                ? error.message
                : JSON.stringify(error ?? {}),
            )
          : [];
      }),
      loadSection("apps", async () => {
        const apps = await listPaginatedCodexData<any>({
          client,
          method: "app/list",
          params: { limit: 100, forceRefetch: false },
        });
        snapshot.apps = apps.map((app: any) => ({
          id: String(app?.id ?? ""),
          name: String(app?.name ?? ""),
          description:
            typeof app?.description === "string" ? app.description : null,
          logoUrl: typeof app?.logoUrl === "string" ? app.logoUrl : null,
          logoUrlDark:
            typeof app?.logoUrlDark === "string" ? app.logoUrlDark : null,
          distributionChannel:
            typeof app?.distributionChannel === "string"
              ? app.distributionChannel
              : null,
          installUrl:
            typeof app?.installUrl === "string" ? app.installUrl : null,
          isAccessible: Boolean(app?.isAccessible),
          isEnabled: Boolean(app?.isEnabled),
          pluginDisplayNames: Array.isArray(app?.pluginDisplayNames)
            ? app.pluginDisplayNames
                .map((name: unknown) => String(name ?? "").trim())
                .filter(Boolean)
            : [],
          labels:
            app?.labels && typeof app.labels === "object"
              ? Object.fromEntries(
                  Object.entries(app.labels).map(([key, value]) => [
                    key,
                    String(value ?? ""),
                  ]),
                )
              : null,
        }));
      }),
      loadSection("experimentalFeatures", async () => {
        const features = await listPaginatedCodexData<any>({
          client,
          method: "experimentalFeature/list",
          params: { limit: 100 },
        });
        snapshot.experimentalFeatures = features.map((feature: any) => ({
          name: String(feature?.name ?? ""),
          stage: typeof feature?.stage === "string" ? feature.stage : "unknown",
          displayName:
            typeof feature?.displayName === "string"
              ? feature.displayName
              : null,
          description:
            typeof feature?.description === "string"
              ? feature.description
              : null,
          announcement:
            typeof feature?.announcement === "string"
              ? feature.announcement
              : null,
          enabled: Boolean(feature?.enabled),
          defaultEnabled: Boolean(feature?.defaultEnabled),
        }));
      }),
      loadSection("mcpServers", async () => {
        const response = await client.request<{ data?: any[] }>(
          "mcpServerStatus/list",
          {
            detail: "full",
          },
        );
        snapshot.mcpServers = (response.data ?? []).map(
          mapCodexMcpStatusSnapshot,
        );
      }),
      loadSection("threads", async () => {
        const threads = await listPaginatedCodexData<any>({
          client,
          method: "thread/list",
          params: {
            cwd,
            archived: false,
            limit: 100,
          },
        });
        snapshot.threads = threads.map((thread: any) =>
          mapCodexThreadSnapshot(thread, false),
        );
      }),
      loadSection("archivedThreads", async () => {
        const threads = await listPaginatedCodexData<any>({
          client,
          method: "thread/list",
          params: {
            cwd,
            archived: true,
            limit: 100,
          },
        });
        snapshot.archivedThreads = threads.map((thread: any) =>
          mapCodexThreadSnapshot(thread, true),
        );
      }),
      loadSection("config", async () => {
        const response = await client.request<any>("config/read", {
          includeLayers: true,
          cwd,
        });
        snapshot.config = mapCodexConfigSnapshot(response);
      }),
      loadSection("configRequirements", async () => {
        const response = await client.request<any>(
          "configRequirements/read",
          {},
        );
        snapshot.configRequirements = response?.requirements
          ? {
              allowedApprovalPolicies: Array.isArray(
                response.requirements.allowedApprovalPolicies,
              )
                ? response.requirements.allowedApprovalPolicies.map(
                    (entry: unknown) => String(entry ?? ""),
                  )
                : null,
              allowedSandboxModes: Array.isArray(
                response.requirements.allowedSandboxModes,
              )
                ? response.requirements.allowedSandboxModes.map(
                    (entry: unknown) => String(entry ?? ""),
                  )
                : null,
              allowedWebSearchModes: Array.isArray(
                response.requirements.allowedWebSearchModes,
              )
                ? response.requirements.allowedWebSearchModes.map(
                    (entry: unknown) => String(entry ?? ""),
                  )
                : null,
              featureRequirements:
                response.requirements.featureRequirements &&
                typeof response.requirements.featureRequirements === "object"
                  ? Object.fromEntries(
                      Object.entries(
                        response.requirements.featureRequirements,
                      ).map(([key, value]) => [key, Boolean(value)]),
                    )
                  : null,
              enforceResidency:
                typeof response.requirements.enforceResidency === "string"
                  ? response.requirements.enforceResidency
                  : null,
            }
          : null;
      }),
      loadSection("externalAgentConfig", async () => {
        const response = await client.request<any>(
          "externalAgentConfig/detect",
          {
            includeHome: true,
            cwds: [cwd],
          },
        );
        snapshot.externalAgentConfigItems = Array.isArray(response?.items)
          ? response.items.map(
              (item: any): CodexExternalAgentConfigMigrationItem => ({
                itemType: String(item?.itemType ?? ""),
                description: String(item?.description ?? ""),
                cwd: typeof item?.cwd === "string" ? item.cwd : null,
              }),
            )
          : [];
      }),
    ]);

    if (loadedSectionCount === 0) {
      return {
        ok: false,
        detail: "Failed to load Codex App Server snapshot.",
        sectionErrors,
      };
    }

    return {
      ok: true,
      detail:
        Object.keys(sectionErrors).length === 0
          ? "Loaded Codex App Server snapshot."
          : `Loaded Codex App Server snapshot with ${Object.keys(sectionErrors).length} section error(s).`,
      sectionErrors,
      snapshot,
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
      sectionErrors: {},
    };
  }
}

export async function getCodexPluginDetail(args: {
  marketplacePath: string;
  pluginName: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexPluginDetailResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("plugin/read", {
      marketplacePath: args.marketplacePath,
      pluginName: args.pluginName,
    });
    return {
      ok: true,
      detail: `Loaded plugin details for ${args.pluginName}.`,
      plugin: mapCodexPluginDetail(response.plugin),
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function installCodexPlugin(args: {
  marketplacePath: string;
  pluginName: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexPluginInstallResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("plugin/install", {
      marketplacePath: args.marketplacePath,
      pluginName: args.pluginName,
      forceRemoteSync: false,
    });
    return {
      ok: true,
      detail: `Installed Codex plugin ${args.pluginName}.`,
      authPolicy:
        typeof response?.authPolicy === "string" ? response.authPolicy : null,
      appsNeedingAuth: Array.isArray(response?.appsNeedingAuth)
        ? response.appsNeedingAuth.map((app: any) => ({
            id: String(app?.id ?? ""),
            name: String(app?.name ?? ""),
            description:
              typeof app?.description === "string" ? app.description : null,
            installUrl:
              typeof app?.installUrl === "string" ? app.installUrl : null,
            needsAuth: Boolean(app?.needsAuth),
          }))
        : [],
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
      authPolicy: null,
      appsNeedingAuth: [],
    };
  }
}

export async function uninstallCodexPlugin(args: {
  pluginId: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("plugin/uninstall", {
      pluginId: args.pluginId,
      forceRemoteSync: false,
    });
    return {
      ok: true,
      detail: `Uninstalled Codex plugin ${args.pluginId}.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function setCodexExperimentalFeatureEnablement(args: {
  enablement: Record<string, boolean>;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("experimentalFeature/enablement/set", {
      enablement: args.enablement,
    });
    return {
      ok: true,
      detail: "Updated Codex experimental feature enablement.",
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function renameCodexThread(args: {
  threadId: string;
  name: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("thread/name/set", {
      threadId: args.threadId,
      name: args.name,
    });
    return {
      ok: true,
      detail: "Renamed Codex thread.",
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function readCodexThread(args: {
  threadId: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexThreadReadResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("thread/read", {
      threadId: args.threadId,
    });
    const rawThread =
      response?.thread && typeof response.thread === "object"
        ? (response.thread as Record<string, unknown>)
        : null;
    if (!rawThread) {
      return {
        ok: false,
        detail: "Codex App Server did not return a thread payload.",
      };
    }
    const snapshot = mapCodexThreadSnapshot(
      rawThread,
      Boolean(rawThread.archived),
    );
    return {
      ok: true,
      detail: "Loaded Codex thread details.",
      thread: {
        ...snapshot,
        turnCount: Array.isArray((rawThread as any).turns)
          ? (rawThread as any).turns.length
          : null,
        raw: rawThread,
      },
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function forkCodexThread(args: {
  threadId: string;
  lastTurnId?: string;
  beforeTurnId?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexThreadForkResponse> {
  try {
    const executablePath = resolveCodexExecutablePath({
      explicitPath: args.runtimeOptions?.codexBinaryPath,
    });
    if (!executablePath) {
      return { ok: false, detail: "Codex executable not found." };
    }
    const boundaryRequested = Boolean(args.lastTurnId || args.beforeTurnId);
    if (
      boundaryRequested &&
      getCodexVersionCapabilities(executablePath).history.forkBoundary !==
        "turn"
    ) {
      return {
        ok: false,
        detail: "The selected Codex version does not support turn-level forks.",
      };
    }
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("thread/fork", {
      threadId: args.threadId,
      ...(args.lastTurnId ? { lastTurnId: args.lastTurnId } : {}),
      ...(args.beforeTurnId ? { beforeTurnId: args.beforeTurnId } : {}),
    });
    return mapCodexThreadForkResponse(response);
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function archiveCodexThread(args: {
  threadId: string;
  archived?: boolean;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request(
      args.archived === false ? "thread/unarchive" : "thread/archive",
      { threadId: args.threadId },
    );
    return {
      ok: true,
      detail:
        args.archived === false
          ? "Restored Codex thread from archive."
          : "Archived Codex thread.",
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function compactCodexThread(args: {
  threadId: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("thread/compact/start", {
      threadId: args.threadId,
    });
    return {
      ok: true,
      detail: "Started Codex thread compaction.",
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function rollbackCodexThread(args: {
  threadId: string;
  numTurns: number;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("thread/rollback", {
      threadId: args.threadId,
      numTurns: args.numTurns,
    });
    return {
      ok: true,
      detail: `Rolled back ${args.numTurns} turn(s) from the Codex thread.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function startCodexReview(args: {
  threadId: string;
  delivery?: "inline" | "detached";
  target:
    | { type: "uncommittedChanges" }
    | { type: "baseBranch"; baseBranch: string }
    | { type: "commit"; sha: string; title?: string }
    | { type: "custom"; instructions: string };
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexReviewStartResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const target =
      args.target.type === "uncommittedChanges"
        ? { type: "uncommittedChanges" as const }
        : args.target.type === "baseBranch"
          ? { type: "baseBranch" as const, branch: args.target.baseBranch }
          : args.target.type === "commit"
            ? {
                type: "commit" as const,
                sha: args.target.sha,
                title: args.target.title ?? null,
              }
            : {
                type: "custom" as const,
                instructions: args.target.instructions,
              };
    const response = await client.request<any>("review/start", {
      threadId: args.threadId,
      delivery: args.delivery ?? "detached",
      target,
    });
    return {
      ok: true,
      detail:
        args.delivery === "inline"
          ? "Started inline Codex review."
          : "Started detached Codex review thread.",
      reviewThreadId:
        typeof response?.reviewThreadId === "string"
          ? response.reviewThreadId
          : undefined,
      turnId:
        typeof response?.turn?.id === "string" ? response.turn.id : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function importCodexExternalConfig(args: {
  migrationItems: CodexExternalAgentConfigMigrationItem[];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("externalAgentConfig/import", {
      migrationItems: args.migrationItems,
    });
    return {
      ok: true,
      detail: "Imported external agent config into Codex.",
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function writeCodexConfigValue(args: {
  keyPath: string;
  value: unknown;
  mergeStrategy?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("config/value/write", {
      keyPath: args.keyPath,
      value: args.value,
      ...(args.mergeStrategy ? { mergeStrategy: args.mergeStrategy } : {}),
    });
    return {
      ok: true,
      detail: `Updated Codex config value at ${args.keyPath}.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function batchWriteCodexConfig(args: {
  edits: Array<{
    keyPath: string;
    value: unknown;
    mergeStrategy?: string;
  }>;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMutationResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    await client.request("config/batchWrite", {
      edits: args.edits.map((edit) => ({
        keyPath: edit.keyPath,
        value: edit.value,
        ...(edit.mergeStrategy ? { mergeStrategy: edit.mergeStrategy } : {}),
      })),
    });
    return {
      ok: true,
      detail: `Applied ${args.edits.length} Codex config edit(s).`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function getCodexConnectedToolStatus(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  toolIds?: ConnectedToolId[];
}): Promise<ConnectedToolStatusResponse> {
  const toolIds = normalizeConnectedToolIds(args.toolIds);
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
  });
  if (!executablePath) {
    return {
      ok: false,
      providerId: "codex",
      detail: "Codex executable not found.",
      tools: toolIds.map((toolId) =>
        createCodexConnectedToolStatusEntry({
          id: toolId,
          state: "error",
          available: false,
          detail: "Codex executable not found.",
        }),
      ),
    };
  }

  try {
    const client = getCodexAppServerClient({
      executablePath,
    });
    const response = await client.request<{ data: CodexMcpServerStatus[] }>(
      "mcpServerStatus/list",
      {},
    );
    return {
      ok: true,
      providerId: "codex",
      detail: "Loaded Codex MCP server status from App Server.",
      tools: toolIds.map((toolId) =>
        mapCodexMcpServerStatus({
          toolId,
          servers: response.data ?? [],
        }),
      ),
    };
  } catch (error) {
    const detail = toCodexUserFacingErrorMessage({
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      providerId: "codex",
      detail,
      tools: toolIds.map((toolId) =>
        createCodexConnectedToolStatusEntry({
          id: toolId,
          state: "error",
          available: false,
          detail,
        }),
      ),
    };
  }
}

export async function runCodexReadOnlyPrompt(
  args: CodexReadOnlyPromptArgs,
): Promise<CodexReadOnlyPromptResult> {
  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const label = args.label?.trim() || DEFAULT_READ_ONLY_PROMPT_LABEL;
  if (args.signal?.aborted) {
    return { ok: false, aborted: true, detail: `${label} was aborted.` };
  }
  const codexExecutablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
  });
  if (!codexExecutablePath) {
    return { ok: false, detail: "Codex executable not found." };
  }
  const client = getCodexAppServerClient({
    executablePath: codexExecutablePath,
  });
  return runCodexReadOnlyPromptWithClient({
    ...args,
    label,
    runtimeCwd,
    request: <T>(method: string, params: unknown) =>
      client.request<T>(method, params),
    respond: (requestId, result) =>
      client.respond(requestId as JsonRpcId, result),
    subscribe: (listener) => client.subscribe(listener),
    buildThreadStartParams: buildCodexThreadStartParams,
    buildTurnStartParams: buildCodexTurnStartParams,
  });
}

export async function suggestCodexPRDescription(args: {
  cwd?: string;
  prompt: string;
  model?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<{ ok: boolean; title?: string; body?: string }> {
  const result = await runCodexReadOnlyPrompt(args);
  if (!result.ok || !result.text) {
    return { ok: false };
  }
  const { title, body } = parsePullRequestSuggestionResponse(result.text);
  return title || body ? { ok: true, title, body } : { ok: false };
}

// Runs an isolated single-turn Codex review over the PR diff. It deliberately
// uses an ephemeral read-only App Server thread so review state cannot leak
// into the user's conversation thread and cannot mutate the workspace.
export async function reviewCodexWorktreeDiff(args: {
  cwd?: string;
  diff: string;
  workingTreeDiff: string;
  commitLog: string;
  fileList: string;
  baseBranch: string;
  headBranch: string;
  agentsContent?: string;
  model?: string;
  mode?: "review" | "intent";
  intentContext?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<{ ok: boolean; findings?: PrePrReviewFinding[] }> {
  const prompt =
    args.mode === "intent"
      ? buildIntentGuardPrompt({
          diff: args.diff,
          workingTreeDiff: args.workingTreeDiff,
          fileList: args.fileList,
          intentContext: args.intentContext ?? "",
        })
      : buildReviewDiffPrompt(args);
  const result = await runCodexReadOnlyPrompt({
    cwd: args.cwd,
    prompt,
    model: args.model,
    outputSchema: PRE_PR_REVIEW_OUTPUT_SCHEMA,
    runtimeOptions: args.runtimeOptions,
  });
  return result.ok
    ? { ok: true, findings: parseReviewFindings(result.text ?? "") }
    : { ok: false };
}

export async function streamCodexWithAppServer(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
    registerApprovalResponder?: (
      responder: (args: {
        requestId: string;
        approved: boolean;
      }) => ProviderResponderResult,
    ) => void;
    registerUserInputResponder?: (
      responder: (args: {
        requestId: string;
        answers?: Record<string, string>;
        denied?: boolean;
      }) => ProviderResponderResult,
    ) => void;
    registerSteerResponder?: (responder: ProviderSteerResponder) => void;
  },
): Promise<BridgeEvent[] | null> {
  const secondaryReadOnly = args.executionPolicy === "secondary-read-only";
  const requestedRuntimeOptions = resolveCodexSecondaryRuntimeOptions({
    enabled: secondaryReadOnly,
    runtimeOptions: args.runtimeOptions,
  });
  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const codexExecutablePath = resolveCodexExecutablePath({
    explicitPath: requestedRuntimeOptions?.codexBinaryPath,
  });
  if (!codexExecutablePath) {
    const unavailableEvents: BridgeEvent[] = [
      {
        type: "error",
        message:
          "Codex runtime failure: Codex CLI not found in runtime override, STAVE_CODEX_CLI_PATH, login-shell PATH, or home-bin candidates. Install `codex` or configure a Codex path override.",
        recoverable: true,
      },
      { type: "done" },
    ];
    unavailableEvents.forEach((event) => args.onEvent?.(event));
    return unavailableEvents;
  }
  const runtimeOptions = downgradeUnsupportedCodexRuntimeOptions({
    executablePath: codexExecutablePath,
    runtimeOptions: requestedRuntimeOptions,
  });
  const workerProfile = secondaryReadOnly ? null : resolveCodexWorkerProfile({ runtimeOptions });
  const workerExecution = workerProfile ? buildWorkerExecutionMetadata(workerProfile) : null;
  const codexCapabilities = getCodexVersionCapabilities(codexExecutablePath);

  // A per-turn process lets Codex resolve MCP bearer_token_env_var settings
  // without exposing bound values to shared clients or read-only analysis.
  const boundSecretEnv =
    secondaryReadOnly ||
    !runtimeOptions?.boundSecretIds ||
    runtimeOptions.boundSecretIds.length === 0
      ? {}
      : await resolveBoundSecretEnv({ ids: runtimeOptions.boundSecretIds });
  const codexRuntimeEnv = buildCodexCliEnv({
    executablePath: codexExecutablePath,
  });
  let client = getCodexAppServerClient({
    executablePath: codexExecutablePath,
  });
  const codexMcpConfigPaths = await resolveCodexMcpConfigPathGroups({
    client,
    cwd: runtimeCwd,
    codexHome: codexRuntimeEnv.CODEX_HOME,
  });
  const codexMcpScope = `codex:${codexExecutablePath}:${codexRuntimeEnv.CODEX_HOME ?? "default"}`;
  const [globalMcpRefresh, projectMcpRefresh] = await Promise.all([
    codexGlobalMcpConfigRefreshTracker.check({
      scopeKey: codexMcpScope,
      paths: codexMcpConfigPaths.globalPaths,
      processStartedAt: client.getProcessStartedAt() ?? undefined,
    }),
    codexProjectMcpConfigRefreshTracker.check({
      scopeKey: `${codexMcpScope}:${runtimeCwd}`,
      paths: codexMcpConfigPaths.projectPaths,
      processStartedAt: client.getProcessStartedAt() ?? undefined,
    }),
  ]);
  if (globalMcpRefresh.changed || projectMcpRefresh.changed) {
    // App Server reads config.toml at process start and resumed threads retain
    // their MCP catalog, so restart and force fresh native threads.
    if ((activeCodexTurnsByExecutable.get(codexExecutablePath) ?? 0) > 0) {
      pendingMcpRefreshExecutables.add(codexExecutablePath);
    } else {
      restartCodexAppServerForMcpConfigChange(codexExecutablePath);
    }
  }

  const transientSecretClient =
    Object.keys(boundSecretEnv).length > 0
      ? new CodexAppServerClient(codexExecutablePath, boundSecretEnv)
      : null;
  client =
    transientSecretClient ??
    getCodexAppServerClient({ executablePath: codexExecutablePath });
  activeCodexTurnsByExecutable.set(
    codexExecutablePath,
    (activeCodexTurnsByExecutable.get(codexExecutablePath) ?? 0) + 1,
  );
  try {
    const account = await client.request<{
      account: unknown | null;
      requiresOpenaiAuth: boolean;
    }>("account/read", { refreshToken: true });
    if (!account.account && account.requiresOpenaiAuth) {
      const events: BridgeEvent[] = [
        {
          type: "error",
          message: "Codex authentication failed. Run `codex login` and retry.",
          recoverable: true,
        },
        { type: "done" },
      ];
      events.forEach((event) => args.onEvent?.(event));
      finishCodexTurn(codexExecutablePath, transientSecretClient);
      return events;
    }
  } catch (error) {
    const events: BridgeEvent[] = [
      {
        type: "error",
        message: toCodexUserFacingErrorMessage({
          message: error instanceof Error ? error.message : String(error),
        }),
        recoverable: true,
      },
      { type: "done" },
    ];
    events.forEach((event) => args.onEvent?.(event));
    finishCodexTurn(codexExecutablePath, transientSecretClient);
    return events;
  }

  let secondaryConfigOverrides: Record<string, string | boolean> | undefined;
  if (secondaryReadOnly) {
    try {
      secondaryConfigOverrides = await resolveCodexSecondaryConfigOverrides(
        client.request.bind(client),
      );
    } catch {
      const events: BridgeEvent[] = [
        {
          type: "error",
          message:
            "Codex secondary execution could not establish MCP isolation.",
          recoverable: false,
        },
        { type: "done", stop_reason: "runtime_failure" },
      ];
      events.forEach((event) => args.onEvent?.(event));
      finishCodexTurn(codexExecutablePath, transientSecretClient);
      return events;
    }
  }

  const secretShellOverrides = buildSecretShellOverrides(boundSecretEnv);
  const boundSecretFingerprint = buildBoundSecretFingerprint(boundSecretEnv);
  const mergedConfigOverrides = await mergeCodexTurnConfigOverrides({
    base: secondaryConfigOverrides,
    secretShellOverrides,
    unattendedAutomationAuthorizationToken:
      args.unattendedAutomation?.authorizationToken,
  });

  let threadId: string;
  let resumedThreadId: string | null;
  try {
    ({ threadId, resumedThreadId } = await ensureCodexThread({
      client,
      executablePath: codexExecutablePath,
      taskId: args.taskId,
      cwd: runtimeCwd,
      conversation: args.conversation,
      runtimeOptions,
      ephemeral: secondaryReadOnly,
      configOverrides: mergedConfigOverrides,
      boundSecretFingerprint,
      secondaryReadOnly,
    }));
  } catch (error) {
    const events: BridgeEvent[] = [
      {
        type: "error",
        message: toCodexUserFacingErrorMessage({
          message: error instanceof Error ? error.message : String(error),
        }),
        recoverable: true,
      },
      { type: "done" },
    ];
    events.forEach((event) => args.onEvent?.(event));
    finishCodexTurn(codexExecutablePath, transientSecretClient);
    return events;
  }

  try {
    const eventCollector = createBoundedBridgeEventCollector({
      maxBytes: CODEX_APP_SERVER_COLLECTED_EVENTS_MAX_BYTES,
      reserveTailBytes: CODEX_APP_SERVER_OVERFLOW_TAIL_BYTES,
    });
    const events: BridgeEvent[] = eventCollector.events;
    let hasEmittedDone = false;
    const emitBridgeEvent = (event: BridgeEvent) => {
      if (event.type === "done") {
        hasEmittedDone = true;
      }
      eventCollector.append(event);
      args.onEvent?.(event);
    };
    const emitBridgeEvents = (nextEvents: BridgeEvent[]) => {
      nextEvents.forEach(emitBridgeEvent);
    };
    const finalizeCollectedEvents = () => {
      if (eventCollector.overflowed) {
        for (const overflowEvent of CODEX_APP_SERVER_OVERFLOW_TAIL_EVENTS) {
          eventCollector.appendTail(overflowEvent);
        }
        if (!hasEmittedDone) {
          args.onEvent?.({ type: "done" });
        }
      } else if (
        !hasEmittedDone &&
        events[events.length - 1]?.type !== "done"
      ) {
        const doneEvent: BridgeEvent = { type: "done" };
        eventCollector.appendTail(doneEvent);
        args.onEvent?.(doneEvent);
      }
      return events;
    };

    emitBridgeEvents(buildCodexThreadStartedEvents({ threadId }));
    const syncedGoalEvent = await readCodexGoalStatusEvent({
      client,
      threadId,
    });
    if (syncedGoalEvent) {
      emitBridgeEvent(syncedGoalEvent);
    }
    const nativeSlashCommandInput = args.conversation
      ? getProviderNativeSlashCommandInput(args.conversation)
      : null;
    const hasEmbeddedStaveLocalMcp = nativeSlashCommandInput
      ? false
      : await hasConnectedStaveLocalMcpForCodex();

    const providerPrompt =
      nativeSlashCommandInput ??
      buildProviderTurnPrompt({
        providerId: args.providerId,
        prompt: args.prompt,
        activeResumeSessionId: resumedThreadId,
        conversation: args.conversation
          ? filterPromptRetrievedContext({
              conversation: args.conversation,
              excludedSourceIds: hasEmbeddedStaveLocalMcp
                ? []
                : ["stave:current-task-awareness"],
            })
          : args.conversation,
      });

    const goalCommandEvents = await runCodexGoalSlashCommand({
      client,
      threadId,
      input: providerPrompt,
    });
    if (goalCommandEvents) {
      emitBridgeEvents(goalCommandEvents);
      if (!secondaryReadOnly) {
        finishCodexTurn(codexExecutablePath, transientSecretClient);
      }
      return finalizeCollectedEvents();
    }

    const compactCommandEvents = await runCodexCompactSlashCommand({
      client,
      threadId,
      input: providerPrompt,
      cwd: runtimeCwd,
    });
    if (compactCommandEvents) {
      emitBridgeEvents(compactCommandEvents);
      if (!secondaryReadOnly) {
        finishCodexTurn(codexExecutablePath, transientSecretClient);
      }
      return finalizeCollectedEvents();
    }

    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });

    const toolOutputBuffers = new Map<string, string>();
    const toolOutputLastEmitAt = new Map<string, number>();
    const agentMessageBuffers = new Map<string, string>();
    const streamedAgentMessageIds = new Set<string>();
    const streamedReasoningIds = new Set<string>();
    const planBuffers = new Map<string, string>();
    const planLastEmitAt = new Map<string, number>();
    const startedMcpToolCallIds = new Set<string>();
    const workerActivity = createCodexWorkerActivityMapper({
      workerExecution,
      inputMaxBytes: CODEX_APP_SERVER_TOOL_OUTPUT_BUFFER_MAX_BYTES,
      outputMaxBytes: CODEX_APP_SERVER_FINAL_TOOL_OUTPUT_MAX_BYTES,
    });
    const pendingApprovalRequests = new Map<string, PendingApprovalRequest>();
    const pendingUserInputRequests = new Map<string, PendingUserInputRequest>();
    let latestUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
    } | null = null;
    let appServerTurnId = "";
    let abortRequested = false;
    let completed = false;
    let resolveTurnCompletion: (() => void) | null = null;
    let interruptFallbackHandle: ReturnType<typeof setTimeout> | null = null;
    let lastAgentMessageSegmentId = "";
    let sawNativePlan = false;
    let shouldInterruptPlanTurn = false;
    let sentPlanInterrupt = false;
    const codexDebug =
      runtimeOptions?.debug ?? process.env.STAVE_CODEX_DEBUG === "1";
    const elicitationPauseController =
      createCodexAppServerElicitationPauseController({
        client,
        threadId,
        debug: codexDebug,
      });
    const waitForTurnCompletion = new Promise<void>((resolve) => {
      resolveTurnCompletion = resolve;
    });

    // ── Approval / user-input auto-decline: symmetric with Claude's
    // `waitForClaudeToolDecision` timeout fallback. See
    // `CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS` for the rationale. ──
    const codexApprovalDecisionTimeoutMs =
      resolveCodexApprovalDecisionTimeoutMs({
        envValue: process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS,
      });
    const pendingApprovalAutoDeclineHandles = new Map<
      string,
      ReturnType<typeof setTimeout>
    >();
    const clearApprovalAutoDecline = (requestId: string) => {
      const handle = pendingApprovalAutoDeclineHandles.get(requestId);
      if (handle == null) {
        return;
      }
      clearTimeout(handle);
      pendingApprovalAutoDeclineHandles.delete(requestId);
    };
    const buildApprovalAutoDeclineTimeoutEvent = (args: {
      kind: "approval" | "user_input";
      toolName: string;
      requestId: string;
    }): BridgeEvent => {
      const seconds = Math.round(codexApprovalDecisionTimeoutMs / 1000);
      const label = args.kind === "user_input" ? "answer" : "approval";
      return {
        type: "error",
        message: `Stave did not receive an ${label} decision for ${args.toolName} (request ${args.requestId}) within ${seconds}s. The request was denied automatically so the turn could continue. If this happened while you were reviewing the request, the approval responder may have been lost — please report this with the devtools console logs.`,
        recoverable: true,
      };
    };
    const scheduleApprovalAutoDecline = (args: {
      requestId: string;
      toolName: string;
    }) => {
      const handle = setTimeout(() => {
        pendingApprovalAutoDeclineHandles.delete(args.requestId);
        const pending = pendingApprovalRequests.get(args.requestId);
        if (!pending || completed) {
          return;
        }
        pendingApprovalRequests.delete(args.requestId);
        console.warn(
          "[provider-runtime] Codex approval request auto-declined after timeout",
          {
            threadId,
            requestId: args.requestId,
            timeoutMs: codexApprovalDecisionTimeoutMs,
          },
        );
        emitBridgeEvent(
          buildApprovalAutoDeclineTimeoutEvent({
            kind: "approval",
            toolName: args.toolName,
            requestId: args.requestId,
          }),
        );
        void client
          .respond(
            pending.serverRequestId,
            pending.responseKind === "elicitation"
              ? { action: "decline" as const }
              : { decision: "decline" as const },
          )
          .catch(() => {})
          .finally(() => elicitationPauseController.end(args.requestId));
      }, codexApprovalDecisionTimeoutMs);
      pendingApprovalAutoDeclineHandles.set(args.requestId, handle);
    };
    const scheduleUserInputAutoDecline = (args: {
      requestId: string;
      toolName: string;
    }) => {
      const handle = setTimeout(() => {
        pendingApprovalAutoDeclineHandles.delete(args.requestId);
        const pending = pendingUserInputRequests.get(args.requestId);
        if (!pending || completed) {
          return;
        }
        pendingUserInputRequests.delete(args.requestId);
        console.warn(
          "[provider-runtime] Codex user-input request auto-declined after timeout",
          {
            threadId,
            requestId: args.requestId,
            timeoutMs: codexApprovalDecisionTimeoutMs,
          },
        );
        emitBridgeEvent(
          buildApprovalAutoDeclineTimeoutEvent({
            kind: "user_input",
            toolName: args.toolName,
            requestId: args.requestId,
          }),
        );
        void client
          .respond(
            pending.serverRequestId,
            pending.responseKind === "elicitation"
              ? { action: "decline" as const }
              : { answers: {} },
          )
          .catch(() => {})
          .finally(() => elicitationPauseController.end(args.requestId));
      }, codexApprovalDecisionTimeoutMs);
      pendingApprovalAutoDeclineHandles.set(args.requestId, handle);
    };

    const clearInterruptFallback = () => {
      if (interruptFallbackHandle == null) {
        return;
      }
      clearTimeout(interruptFallbackHandle);
      interruptFallbackHandle = null;
    };

    const finishTurnWait = () => {
      if (completed) {
        return;
      }
      completed = true;
      clearInterruptFallback();
      const resolve = resolveTurnCompletion;
      resolveTurnCompletion = null;
      resolve?.();
    };

    const requestPlanInterrupt = () => {
      if (
        !runtimeOptions?.codexPlanMode ||
        sentPlanInterrupt ||
        !appServerTurnId ||
        completed
      ) {
        return;
      }
      sentPlanInterrupt = true;
      void client
        .request("turn/interrupt", {
          threadId,
          turnId: appServerTurnId,
        })
        .catch(() => {});
    };

    args.registerApprovalResponder?.(({ requestId, approved }) => {
      const pending = pendingApprovalRequests.get(requestId);
      if (!pending) {
        return {
          ok: false,
          reason: "unknown-request",
          pendingRequestIds: Array.from(pendingApprovalRequests.keys()),
        };
      }
      pendingApprovalRequests.delete(requestId);
      clearApprovalAutoDecline(requestId);
      void client
        .respond(
          pending.serverRequestId,
          (() => {
            if (pending.responseKind === "commandExecution") {
              return { decision: approved ? "accept" : "decline" };
            }
            if (pending.responseKind === "fileChange") {
              return { decision: approved ? "accept" : "decline" };
            }
            if (pending.responseKind === "permissions") {
              return approved
                ? {
                    permissions: {
                      ...(pending.permissions?.network
                        ? { network: pending.permissions.network }
                        : {}),
                      ...(pending.permissions?.fileSystem
                        ? { fileSystem: pending.permissions.fileSystem }
                        : {}),
                    },
                    scope: "turn",
                  }
                : { permissions: {}, scope: "turn" };
            }
            if (pending.responseKind === "elicitation") {
              return { action: approved ? "accept" : "decline" };
            }
            return { decision: approved ? "approved" : "denied" };
          })(),
        )
        .finally(() => elicitationPauseController.end(requestId));
      return { ok: true };
    });

    args.registerUserInputResponder?.(({ requestId, answers, denied }) => {
      const pending = pendingUserInputRequests.get(requestId);
      if (!pending) {
        return {
          ok: false,
          reason: "unknown-request",
          pendingRequestIds: Array.from(pendingUserInputRequests.keys()),
        };
      }
      pendingUserInputRequests.delete(requestId);
      clearApprovalAutoDecline(requestId);
      if (pending.responseKind === "elicitation") {
        if (denied) {
          void client
            .respond(pending.serverRequestId, {
              action: "decline",
            })
            .finally(() => elicitationPauseController.end(requestId));
          return { ok: true };
        }

        if (pending.elicitationMode === "url") {
          void client
            .respond(pending.serverRequestId, {
              action: "accept",
            })
            .finally(() => elicitationPauseController.end(requestId));
          return { ok: true };
        }

        const content = Object.fromEntries(
          (pending.elicitationFields ?? []).flatMap((field) => {
            const rawValue = answers?.[field.key];
            if (typeof rawValue !== "string") {
              return [];
            }
            const coerced = coerceElicitationAnswer({
              rawValue,
              field,
            });
            return coerced === undefined ? [] : [[field.key, coerced]];
          }),
        );
        void client
          .respond(pending.serverRequestId, {
            action: "accept",
            content,
          })
          .finally(() => elicitationPauseController.end(requestId));
        return { ok: true };
      }

      const responseAnswers = Object.fromEntries(
        Object.entries(answers ?? {}).map(([key, value]) => [
          key,
          { answers: [value] },
        ]),
      );
      void client
        .respond(pending.serverRequestId, {
          answers: denied ? {} : responseAnswers,
        })
        .finally(() => elicitationPauseController.end(requestId));
      return { ok: true };
    });

    args.registerSteerResponder?.(async ({ text, clientMessageId }) => {
      if (!appServerTurnId || completed) {
        return {
          ok: false,
          reason: "turn-not-steerable",
          pendingRequestIds: [],
        };
      }
      try {
        const steerResponse = await client.request<{ turnId: string }>(
          "turn/steer",
          buildCodexTurnSteerParams({
            threadId,
            expectedTurnId: appServerTurnId,
            text,
            clientMessageId,
          }),
          { timeoutMs: CODEX_STEER_REQUEST_TIMEOUT_MS },
        );
        // CRITICAL: the steer response may carry a *new* turnId. The notification
        // filter (see the `client.subscribe` handler below) drops any message
        // whose `params.turnId` doesn't match `appServerTurnId`. If we don't
        // reassign it here, all subsequent streamed output for the rest of the
        // turn is silently dropped while the turn still visibly "completes".
        // Reassigning live also fixes abort-after-steer, since every
        // `turn/interrupt` call site reads `appServerTurnId` by reference.
        if (
          typeof steerResponse?.turnId === "string" &&
          steerResponse.turnId.length > 0
        ) {
          appServerTurnId = steerResponse.turnId;
        }
        return { ok: true };
      } catch (error) {
        console.warn("[codex-app-server-runtime] turn/steer rejected", {
          threadId,
          appServerTurnId,
          error: toErrorMessage(error),
        });
        return {
          ok: false,
          reason: "turn-not-steerable",
          pendingRequestIds: [],
        };
      }
    });

    const unsubscribe = client.subscribe((message) => {
      if (codexDebug && shouldDebugCodexAppServerMessage(message)) {
        console.debug("[codex-app-server-runtime] raw lifecycle message", {
          activeThreadId: threadId,
          activeTurnId: appServerTurnId || null,
          message: summarizeCodexAppServerDebugMessage(message),
        });
      }
      if (completed) {
        return;
      }
      if (!message.method) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const requestParams = isRecord(message.params) ? message.params : null;
        const requestThreadId =
          typeof requestParams?.threadId === "string"
            ? requestParams.threadId
            : null;
        // Notifications are thread-filtered further down, but requests were
        // not: with the App Server client shared process-wide, a request raised
        // on another thread (an isolated Advisor thread, or another task's turn)
        // surfaced in *this* turn's UI and was answered on its behalf.
        if (requestThreadId && threadId && requestThreadId !== threadId && !workerActivity.ownsChildThread(requestThreadId)) {
          return;
        }
        const requestId = String(message.id);
        const secondaryDenial = secondaryReadOnly
          ? buildCodexSecondaryServerRequestDenial(message.method)
          : null;
        if (secondaryDenial) {
          void client
            .respond(message.id as JsonRpcId, secondaryDenial)
            .catch(() => {});
          emitBridgeEvent({
            type: "error",
            message:
              "Codex secondary execution requested an interactive or privileged operation.",
            recoverable: false,
          });
          return;
        }
        switch (message.method as ServerRequestMethod) {
          case "item/commandExecution/requestApproval": {
            const params = (message.params ?? {}) as Record<string, unknown>;
            const approvalInput = buildApprovalInput({ params });
            pendingApprovalRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "commandExecution",
            });
            void elicitationPauseController.begin(requestId);
            scheduleApprovalAutoDecline({ requestId, toolName: "bash" });
            emitBridgeEvent({
              type: "approval",
              toolName: "bash",
              requestId,
              description: buildApprovalDescription({
                method: "item/commandExecution/requestApproval",
                params,
              }),
              ...(approvalInput ? { input: approvalInput } : {}),
            });
            return;
          }
          case "item/fileChange/requestApproval": {
            const params = (message.params ?? {}) as Record<string, unknown>;
            pendingApprovalRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "fileChange",
            });
            void elicitationPauseController.begin(requestId);
            scheduleApprovalAutoDecline({ requestId, toolName: "apply_patch" });
            emitBridgeEvent({
              type: "approval",
              toolName: "apply_patch",
              requestId,
              description: buildApprovalDescription({
                method: "item/fileChange/requestApproval",
                params,
              }),
            });
            return;
          }
          case "item/permissions/requestApproval": {
            const params = (message.params ?? {}) as Record<string, unknown>;
            pendingApprovalRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "permissions",
              permissions:
                typeof params.permissions === "object" && params.permissions
                  ? (params.permissions as PendingApprovalRequest["permissions"])
                  : null,
            });
            void elicitationPauseController.begin(requestId);
            scheduleApprovalAutoDecline({ requestId, toolName: "permissions" });
            emitBridgeEvent({
              type: "approval",
              toolName: "permissions",
              requestId,
              description: buildApprovalDescription({
                method: "item/permissions/requestApproval",
                params,
              }),
            });
            return;
          }
          case "applyPatchApproval":
          case "execCommandApproval": {
            const params = (message.params ?? {}) as Record<string, unknown>;
            const approvalInput = buildApprovalInput({ params });
            pendingApprovalRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "review",
            });
            void elicitationPauseController.begin(requestId);
            scheduleApprovalAutoDecline({
              requestId,
              toolName: mapApprovalToolName(
                message.method as ServerRequestMethod,
              ),
            });
            emitBridgeEvent({
              type: "approval",
              toolName: mapApprovalToolName(
                message.method as ServerRequestMethod,
              ),
              requestId,
              description: buildApprovalDescription({
                method: message.method as ServerRequestMethod,
                params,
              }),
              ...(approvalInput ? { input: approvalInput } : {}),
            });
            return;
          }
          case "item/tool/requestUserInput": {
            const params = (message.params ?? {}) as Record<string, unknown>;
            const questions = Array.isArray(params.questions)
              ? mapUserInputQuestions(
                  params.questions as Array<Record<string, unknown>>,
                )
              : [];
            pendingUserInputRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "tool",
            });
            void elicitationPauseController.begin(requestId);
            scheduleUserInputAutoDecline({
              requestId,
              toolName: "request_user_input",
            });
            emitBridgeEvent({
              type: "user_input",
              toolName: "request_user_input",
              requestId,
              questions,
            });
            return;
          }
          case "mcpServer/elicitation/request": {
            const params = (message.params ?? {}) as Record<string, unknown>;
            const approval = mapCodexElicitationToApproval(params);
            if (
              approval &&
              shouldAutoApproveStaveLocalMcpElicitation({
                enabled:
                  runtimeOptions?.codexAutoApproveStaveLocalMcpTools === true,
                params,
              })
            ) {
              void client
                .respond(message.id as JsonRpcId, { action: "accept" })
                .catch((error) => {
                  emitBridgeEvent({
                    type: "error",
                    message: `Codex could not auto-approve ${approval.toolName}: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                    recoverable: true,
                  });
                });
              return;
            }
            if (approval) {
              pendingApprovalRequests.set(requestId, {
                serverRequestId: message.id as JsonRpcId,
                responseKind: "elicitation",
              });
              void elicitationPauseController.begin(requestId);
              scheduleApprovalAutoDecline({
                requestId,
                toolName: approval.toolName,
              });
              emitBridgeEvent({
                type: "approval",
                toolName: approval.toolName,
                requestId,
                description: approval.description,
              });
              return;
            }
            const elicitation = mapCodexElicitationToUserInput(params);
            if (!elicitation) {
              emitBridgeEvent({
                type: "error",
                message:
                  "Codex MCP elicitation could not be rendered by Stave.",
                recoverable: true,
              });
              void client.respond(message.id as JsonRpcId, {
                action: "cancel",
              });
              return;
            }
            pendingUserInputRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "elicitation",
              elicitationMode: elicitation.mode,
              elicitationFields: elicitation.fields,
            });
            void elicitationPauseController.begin(requestId);
            scheduleUserInputAutoDecline({
              requestId,
              toolName: "mcp_elicitation",
            });
            emitBridgeEvent({
              type: "user_input",
              toolName: "mcp_elicitation",
              requestId,
              questions: elicitation.questions,
            });
            return;
          }
          case "item/tool/call":
            emitBridgeEvent({
              type: "error",
              message: `${message.method} is not supported in Stave yet.`,
              recoverable: true,
            });
            void client.respond(message.id as JsonRpcId, {});
            return;
          case "account/chatgptAuthTokens/refresh": {
            const params = (message.params ??
              {}) as CodexChatgptAuthTokensRefreshParams;
            void (async () => {
              try {
                const response = await refreshCodexChatgptAuthTokens({
                  executablePath: codexExecutablePath,
                  previousAccountId: params.previousAccountId,
                });
                await client.respond(message.id as JsonRpcId, response);
              } catch (error) {
                const messageText = toCodexUserFacingErrorMessage({
                  message:
                    error instanceof Error ? error.message : String(error),
                });
                emitBridgeEvent({
                  type: "error",
                  message: messageText,
                  recoverable: true,
                });
                await client.respondError(message.id as JsonRpcId, {
                  code: -32000,
                  message: messageText,
                });
              }
            })();
            return;
          }
          default:
            return;
        }
      }

      const params = (message.params ?? {}) as Record<string, unknown>;
      if (message.method === "thread/goal/updated") {
        const goal = normalizeCodexThreadGoal(params.goal);
        const eventThreadId =
          typeof params.threadId === "string"
            ? params.threadId
            : goal?.threadId;
        if (eventThreadId === threadId && goal) {
          emitBridgeEvent(buildCodexGoalStatusEvent(goal));
        }
        return;
      }
      if (message.method === "thread/goal/cleared") {
        const eventThreadId =
          typeof params.threadId === "string" ? params.threadId : "";
        if (eventThreadId === threadId) {
          emitBridgeEvent(buildCodexGoalStatusEvent(null));
        }
        return;
      }
      const eventThreadId = typeof params.threadId === "string" ? params.threadId : "";
      if (eventThreadId && eventThreadId !== threadId) {
        const mapped = workerActivity.mapForeignNotification({
          method: message.method,
          threadId: eventThreadId,
          params,
        });
        emitBridgeEvents(mapped.events);
        return;
      }
      if (
        typeof params.turnId === "string" &&
        appServerTurnId &&
        params.turnId !== appServerTurnId
      ) {
        return;
      }
      switch (message.method) {
        case "hook/started":
        case "hook/completed": {
          if (!codexCapabilities.hooks.lifecycleEvents) {
            return;
          }
          const hookEvent = mapCodexHookNotificationToBridgeEvent(params);
          if (hookEvent) {
            emitBridgeEvent(hookEvent);
          }
          return;
        }
        case "item/started": {
          const workerMapping = workerActivity.mapStarted(params.item);
          if (workerMapping.handled) {
            emitBridgeEvents(workerMapping.events);
            return;
          }
          const item = params.item as CodexMcpToolCallItem | undefined;
          if (item?.type !== "mcpToolCall") {
            return;
          }
          const itemId = typeof item.id === "string" ? item.id : "";
          if (!itemId || startedMcpToolCallIds.has(itemId)) {
            return;
          }
          startedMcpToolCallIds.add(itemId);
          emitBridgeEvent(buildCodexMcpToolCallInputEvent(item, workerExecution));
          return;
        }
        case "item/agentMessage/delta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : "";
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (!delta) {
            return;
          }
          streamedAgentMessageIds.add(itemId);
          if (itemId) {
            agentMessageBuffers.set(
              itemId,
              appendBoundedCodexBuffer({
                current: agentMessageBuffers.get(itemId) ?? "",
                chunk: delta,
                keep: "prefix",
                maxBytes: CODEX_APP_SERVER_MESSAGE_BUFFER_MAX_BYTES,
              }),
            );
            lastAgentMessageSegmentId = itemId;
          }
          emitBridgeEvent({
            type: "text",
            text: delta,
            ...(itemId ? { segmentId: itemId } : {}),
          });
          return;
        }
        case "item/reasoning/textDelta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : "";
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (!delta) {
            return;
          }
          streamedReasoningIds.add(itemId);
          emitBridgeEvent({
            type: "thinking",
            text: delta,
            isStreaming: true,
          });
          return;
        }
        case "item/reasoning/summaryTextDelta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : "";
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (!delta) {
            return;
          }
          streamedReasoningIds.add(itemId);
          emitBridgeEvent({
            type: "thinking",
            text: delta,
            isStreaming: true,
          });
          return;
        }
        case "item/plan/delta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : "";
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (!delta) {
            return;
          }
          sawNativePlan = true;
          const next = appendBoundedCodexBuffer({
            current: planBuffers.get(itemId) ?? "",
            chunk: delta,
            keep: "prefix",
            maxBytes: CODEX_APP_SERVER_PLAN_BUFFER_MAX_BYTES,
          });
          planBuffers.set(itemId, next);
          const now = Date.now();
          const lastEmitAt = planLastEmitAt.get(itemId) ?? 0;
          if (
            now - lastEmitAt >=
            CODEX_APP_SERVER_PARTIAL_PLAN_EMIT_THROTTLE_MS
          ) {
            planLastEmitAt.set(itemId, now);
            emitBridgeEvent({
              type: "plan_ready",
              planText: truncateCodexSnapshot({
                value: next,
                maxBytes: CODEX_APP_SERVER_PLAN_EVENT_MAX_BYTES,
              }),
              ...(itemId ? { sourceSegmentId: itemId } : {}),
            });
          }
          return;
        }
        case "item/commandExecution/outputDelta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : "";
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (!itemId || !delta) {
            return;
          }
          const next = appendBoundedCodexBuffer({
            current: toolOutputBuffers.get(itemId) ?? "",
            chunk: delta,
            keep: "suffix",
            maxBytes: CODEX_APP_SERVER_TOOL_OUTPUT_BUFFER_MAX_BYTES,
          });
          toolOutputBuffers.set(itemId, next);
          const now = Date.now();
          const lastEmitAt = toolOutputLastEmitAt.get(itemId) ?? 0;
          if (
            now - lastEmitAt >=
            CODEX_APP_SERVER_PARTIAL_TOOL_EMIT_THROTTLE_MS
          ) {
            toolOutputLastEmitAt.set(itemId, now);
            emitBridgeEvent({
              type: "tool_result",
              tool_use_id: itemId,
              output: truncateCodexSnapshot({
                value: next,
                maxBytes: CODEX_APP_SERVER_PARTIAL_TOOL_OUTPUT_MAX_BYTES,
              }),
              isPartial: true,
            });
          }
          return;
        }
        case "item/mcpToolCall/progress": {
          const itemId = typeof params.itemId === "string" ? params.itemId : "";
          const progressMessage =
            typeof params.message === "string" ? params.message : "";
          if (!progressMessage) {
            return;
          }
          // `itemId` is a tool-use id, never an agent id. Only tag `agentId`
          // when this item actually spawned a child thread Codex named.
          const progressAgentId = itemId
            ? (workerActivity.agentIdForToolUseId(itemId) ?? "")
            : "";
          emitBridgeEvent({
            type: "subagent_progress",
            ...(itemId ? { toolUseId: itemId } : {}),
            content: progressMessage,
            ...(progressAgentId ? { agentId: progressAgentId } : {}),
          });
          return;
        }
        case "thread/tokenUsage/updated": {
          const tokenUsage = params.tokenUsage as
            | {
                last?: {
                  inputTokens?: number;
                  outputTokens?: number;
                  cachedInputTokens?: number;
                };
              }
            | undefined;
          if (!tokenUsage?.last) {
            return;
          }
          latestUsage = {
            inputTokens: tokenUsage.last.inputTokens ?? 0,
            outputTokens: tokenUsage.last.outputTokens ?? 0,
            ...(typeof tokenUsage.last.cachedInputTokens === "number" &&
            tokenUsage.last.cachedInputTokens > 0
              ? { cacheReadTokens: tokenUsage.last.cachedInputTokens }
              : {}),
          };
          return;
        }
        case "error": {
          const errorMessage =
            extractCodexAppServerErrorMessage(params) ??
            "Codex App Server error.";
          emitBridgeEvent({
            type: "error",
            message: toCodexUserFacingErrorMessage({ message: errorMessage }),
            recoverable: true,
          });
          return;
        }
        case "item/completed": {
          const workerMapping = workerActivity.mapCompleted(params.item);
          if (workerMapping.handled) {
            emitBridgeEvents(workerMapping.events);
            return;
          }
          const item = params.item as
            { type?: string; id?: string } | undefined;
          if (!item?.type) {
            return;
          }
          const itemId = typeof item.id === "string" ? item.id : "";
          switch (item.type) {
            case "agentMessage": {
              const text =
                typeof (item as { text?: unknown }).text === "string"
                  ? String((item as { text?: unknown }).text)
                  : "";
              if (itemId && text) {
                agentMessageBuffers.set(
                  itemId,
                  truncateCodexSnapshot({
                    value: text,
                    maxBytes: CODEX_APP_SERVER_MESSAGE_BUFFER_MAX_BYTES,
                  }),
                );
                lastAgentMessageSegmentId = itemId;
              }
              if (!streamedAgentMessageIds.has(itemId) && text) {
                emitBridgeEvent({
                  type: "text",
                  text: truncateCodexSnapshot({
                    value: text,
                    maxBytes: CODEX_APP_SERVER_MESSAGE_BUFFER_MAX_BYTES,
                  }),
                  ...(itemId ? { segmentId: itemId } : {}),
                });
              }
              return;
            }
            case "plan": {
              const text =
                typeof (item as { text?: unknown }).text === "string"
                  ? String((item as { text?: unknown }).text)
                  : "";
              if (itemId) {
                planLastEmitAt.delete(itemId);
              }
              const planText = truncateCodexSnapshot({
                value: text || planBuffers.get(itemId) || "",
                maxBytes: CODEX_APP_SERVER_PLAN_EVENT_MAX_BYTES,
              });
              if (itemId) {
                planBuffers.delete(itemId);
              }
              if (planText.trim().length > 0) {
                sawNativePlan = true;
                emitBridgeEvent({
                  type: "plan_ready",
                  planText,
                  ...(itemId ? { sourceSegmentId: itemId } : {}),
                });
              }
              if (runtimeOptions?.codexPlanMode) {
                shouldInterruptPlanTurn = true;
                requestPlanInterrupt();
              }
              return;
            }
            case "reasoning": {
              const reasoningItem = item as {
                content?: string[];
                summary?: string[];
              };
              if (!streamedReasoningIds.has(itemId)) {
                const text = truncateCodexSnapshot({
                  value: [
                    ...(reasoningItem.summary ?? []),
                    ...(reasoningItem.content ?? []),
                  ].join("\n"),
                  maxBytes: CODEX_APP_SERVER_MESSAGE_BUFFER_MAX_BYTES,
                });
                if (text.trim().length > 0) {
                  emitBridgeEvent({
                    type: "thinking",
                    text,
                    isStreaming: false,
                  });
                  return;
                }
                return;
              }
              emitBridgeEvent({
                type: "thinking",
                text: "",
                isStreaming: false,
              });
              return;
            }
            case "commandExecution": {
              const commandItem = item as {
                command?: string;
                aggregatedOutput?: string | null;
                status?: string;
              };
              if (itemId) {
                toolOutputLastEmitAt.delete(itemId);
              }
              const output = truncateCodexSnapshot({
                value:
                  typeof commandItem.aggregatedOutput === "string"
                    ? commandItem.aggregatedOutput
                    : (toolOutputBuffers.get(itemId) ?? ""),
                maxBytes: CODEX_APP_SERVER_FINAL_TOOL_OUTPUT_MAX_BYTES,
              });
              if (itemId) {
                toolOutputBuffers.delete(itemId);
              }
              emitBridgeEvents([
                {
                  type: "tool",
                  ...(itemId ? { toolUseId: itemId } : {}),
                  toolName: "bash",
                  input:
                    typeof commandItem.command === "string"
                      ? commandItem.command
                      : "",
                  state: "input-available",
                },
                {
                  type: "tool_result",
                  tool_use_id: itemId,
                  output,
                  ...(commandItem.status === "failed" ||
                  commandItem.status === "declined"
                    ? { isError: true }
                    : {}),
                },
              ]);
              return;
            }
            case "mcpToolCall": {
              const mcpItem = item as CodexMcpToolCallItem;
              const completedEvents: BridgeEvent[] = [];
              if (!itemId || !startedMcpToolCallIds.delete(itemId)) {
                completedEvents.push(buildCodexMcpToolCallInputEvent(mcpItem, workerExecution));
              }
              completedEvents.push({
                type: "tool_result",
                tool_use_id: itemId,
                output: mcpItem.error?.message
                  ? `[error] ${mcpItem.error.message}`
                  : truncateCodexSnapshot({
                      value: toText(mcpItem.result ?? ""),
                      maxBytes: CODEX_APP_SERVER_FINAL_TOOL_OUTPUT_MAX_BYTES,
                    }),
                ...(mcpItem.status === "failed" ? { isError: true } : {}),
              });
              emitBridgeEvents(completedEvents);
              return;
            }
            case "webSearch": {
              const query =
                typeof (item as { query?: unknown }).query === "string"
                  ? String((item as { query?: unknown }).query)
                  : "";
              emitBridgeEvents([
                {
                  type: "tool",
                  ...(itemId ? { toolUseId: itemId } : {}),
                  toolName: "web_search",
                  input: query,
                  state: "input-available",
                },
                {
                  type: "tool_result",
                  tool_use_id: itemId,
                  output: "",
                },
              ]);
              return;
            }
            case "fileChange": {
              const fileChangeItem = item as {
                changes?: Array<{ path?: string }>;
                status?: string;
              };
              if (fileChangeItem.status === "failed") {
                emitBridgeEvent({
                  type: "error",
                  message: `File change failed: ${(fileChangeItem.changes ?? [])
                    .map((change) => change.path ?? "")
                    .filter(Boolean)
                    .join(", ")}`,
                  recoverable: false,
                });
                return;
              }
              const changedPaths = (fileChangeItem.changes ?? [])
                .map((change) => change.path ?? "")
                .filter(Boolean);
              void diffTracker
                .buildDiffEvents({ changedPaths })
                .then(({ diffEvents, unresolvedPaths }) => {
                  const fallbackEvents = diffTracker.buildFallbackEvents({
                    appliedPaths: diffEvents.length === 0 ? changedPaths : [],
                    skippedPaths: unresolvedPaths,
                  });
                  emitBridgeEvents([...diffEvents, ...fallbackEvents]);
                })
                .catch(() => {
                  emitBridgeEvents(
                    diffTracker.buildFallbackEvents({
                      appliedPaths: changedPaths,
                    }),
                  );
                });
              return;
            }
            case "todo_list": {
              // Mirror the legacy codex-sdk runtime: surface Codex's todo_list
              // items as a TodoWrite tool_use bridge event so the TodoFloater
              // (which scans for toolName === "TodoWrite") can render them.
              const todoItem = item as {
                items?: Array<{ text?: string; completed?: boolean }>;
              };
              const todos = (todoItem.items ?? []).map((entry) => ({
                content: entry.text ?? "",
                status: entry.completed ? "completed" : "pending",
              }));
              emitBridgeEvent({
                type: "tool",
                ...(itemId ? { toolUseId: itemId } : {}),
                toolName: "TodoWrite",
                input: JSON.stringify({ todos }),
                state: "output-available",
              });
              return;
            }
            default:
              return;
          }
        }
        case "turn/completed": {
          const turn = params.turn as
            | {
                status?: string;
                error?: { message?: string | null } | null;
              }
            | undefined;
          if (runtimeOptions?.codexPlanMode && !sawNativePlan) {
            const fallbackSegmentId = lastAgentMessageSegmentId.trim();
            const fallbackPlanText = truncateCodexSnapshot({
              value: fallbackSegmentId
                ? (agentMessageBuffers.get(fallbackSegmentId) ?? "")
                : "",
              maxBytes: CODEX_APP_SERVER_PLAN_EVENT_MAX_BYTES,
            });
            if (fallbackPlanText.trim().length > 0) {
              emitBridgeEvent({
                type: "plan_ready",
                planText: fallbackPlanText,
                ...(fallbackSegmentId
                  ? { sourceSegmentId: fallbackSegmentId }
                  : {}),
              });
            }
          }
          if (turn?.status === "failed" && !abortRequested) {
            emitBridgeEvent({
              type: "error",
              message: toCodexUserFacingErrorMessage({
                message: turn.error?.message ?? "Codex App Server turn failed.",
              }),
              recoverable: true,
            });
          }
          if (latestUsage) {
            emitBridgeEvent({
              type: "usage",
              ...latestUsage,
            });
          }
          emitBridgeEvent(
            abortRequested
              ? { type: "done", stop_reason: "user_abort" }
              : { type: "done" },
          );
          finishTurnWait();
          return;
        }
        default:
          return;
      }
    });

    // ── Process-death listener: resolve waitForTurnCompletion if the app
    // server exits unexpectedly so the turn never hangs forever. ──
    const unsubscribeProcessExit = client.onProcessExit((exitMessage) => {
      if (completed) {
        return;
      }
      console.warn(
        "[provider-runtime] Codex app-server process exited during turn",
        { threadId, appServerTurnId: appServerTurnId || null, exitMessage },
      );
      emitBridgeEvent({
        type: "error",
        message: toCodexUserFacingErrorMessage({ message: exitMessage }),
        recoverable: true,
      });
      emitBridgeEvent(
        abortRequested
          ? { type: "done", stop_reason: "user_abort" }
          : { type: "done" },
      );
      finishTurnWait();
    });

    // ── Register abort BEFORE turn/start so the user can cancel at any
    // point, including while the turn/start request is still in flight. ──
    args.registerAbort?.(() => {
      abortRequested = true;
      if (!appServerTurnId) {
        // turn/start hasn't resolved yet — no turnId to interrupt.
        // Resolve the wait so the Promise.race below exits.
        emitBridgeEvent({ type: "done", stop_reason: "user_abort" });
        finishTurnWait();
        return;
      }
      // Normal interrupt: we have a turnId.
      clearInterruptFallback();
      interruptFallbackHandle = setTimeout(() => {
        interruptFallbackHandle = null;
        if (completed) {
          return;
        }
        console.warn(
          "[provider-runtime] Codex app-server interrupt did not settle after 10 seconds",
          { threadId, appServerTurnId },
        );
        emitBridgeEvent({ type: "done", stop_reason: "user_abort" });
        finishTurnWait();
      }, APP_SERVER_INTERRUPT_GRACE_MS);
      void client
        .request("turn/interrupt", {
          threadId,
          turnId: appServerTurnId,
        })
        .catch((error) => {
          console.warn(
            "[provider-runtime] Codex app-server interrupt request failed",
            {
              threadId,
              appServerTurnId,
              error: toErrorMessage(error),
            },
          );
        });
    });

    try {
      const gitRef = resolveGitHeadRef({ cwd: runtimeCwd });
      emitBridgeEvent({
        type: "system",
        content: "Checkpoint captured before Codex turn.",
        compactBoundary: {
          trigger: "turn_start",
          ...(gitRef ? { gitRef } : {}),
        },
      });

      // Race turn/start against waitForTurnCompletion so an abort (or
      // process death) during the request isn't blocked until the outer
      // 3-hour timeout.
      const turnStartPromise = client.request<{ turn: { id: string } }>(
        "turn/start",
        buildCodexTurnStartParams({
          threadId,
          cwd: runtimeCwd,
          prompt: providerPrompt,
          runtimeOptions,
        }),
      );

      const turnResponse = await Promise.race([
        turnStartPromise,
        waitForTurnCompletion.then(() => null as null),
      ]);

      // If waitForTurnCompletion won the race (abort or process death during
      // turn/start), clean up the orphaned turn/start and return.
      if (turnResponse == null || completed) {
        void turnStartPromise
          .then((resolved) => {
            void client
              .request("turn/interrupt", {
                threadId,
                turnId: resolved.turn.id,
              })
              .catch(() => {});
          })
          .catch(() => {});
        return finalizeCollectedEvents();
      }

      appServerTurnId = turnResponse.turn.id;
      emitBridgeEvent({
        type: "provider_turn",
        providerId: "codex",
        nativeSessionId: threadId,
        nativeTurnId: appServerTurnId,
      });
      if (codexCapabilities.history.forkBoundary === "turn") {
        emitBridgeEvent({
          type: "history_boundary",
          providerId: "codex",
          boundaryKind: "turn",
          nativeId: appServerTurnId,
          targetRole: "assistant",
        });
      }
      if (codexDebug) {
        console.debug("[codex-app-server-runtime] turn/start acknowledged", {
          threadId,
          turnId: appServerTurnId,
        });
      }

      // If the user pressed stop while turn/start was in flight, we now have
      // a turnId and can send a proper interrupt.
      if (abortRequested) {
        clearInterruptFallback();
        interruptFallbackHandle = setTimeout(() => {
          interruptFallbackHandle = null;
          if (completed) {
            return;
          }
          emitBridgeEvent({ type: "done", stop_reason: "user_abort" });
          finishTurnWait();
        }, APP_SERVER_INTERRUPT_GRACE_MS);
        void client
          .request("turn/interrupt", {
            threadId,
            turnId: appServerTurnId,
          })
          .catch(() => {});
      }

      if (shouldInterruptPlanTurn) {
        requestPlanInterrupt();
      }

      await waitForTurnCompletion;

      return finalizeCollectedEvents();
    } catch (error) {
      // Distinguish abort from real failures (symmetric with claude-sdk-runtime).
      const isAbort =
        (error instanceof Error && error.name === "AbortError") ||
        (error instanceof Error && /aborted|cancel/i.test(error.message));
      if (isAbort) {
        console.info("[provider-runtime] Codex app-server turn aborted", {
          threadId,
          appServerTurnId,
        });
        const abortEvents: BridgeEvent[] = [
          { type: "done", stop_reason: "user_abort" },
        ];
        abortEvents.forEach((event) => args.onEvent?.(event));
        return abortEvents;
      }
      const errorEvent: BridgeEvent = {
        type: "error",
        message: toCodexUserFacingErrorMessage({
          message: error instanceof Error ? error.message : String(error),
        }),
        recoverable: true,
      };
      emitBridgeEvent(errorEvent);
      emitBridgeEvent({ type: "done" });
      return finalizeCollectedEvents();
    } finally {
      clearInterruptFallback();
      unsubscribeProcessExit();
      // Reject any pending approval/input requests so the Codex app-server
      // doesn't hang waiting for a response that will never arrive.
      for (const [id, pending] of pendingApprovalRequests) {
        clearApprovalAutoDecline(id);
        const declinePayload =
          pending.responseKind === "elicitation"
            ? { action: "decline" as const }
            : { decision: "decline" as const };
        void client
          .respond(pending.serverRequestId, declinePayload)
          .catch(() => {});
        pendingApprovalRequests.delete(id);
      }
      for (const [id, pending] of pendingUserInputRequests) {
        clearApprovalAutoDecline(id);
        const declinePayload =
          pending.responseKind === "elicitation"
            ? { action: "decline" as const }
            : { answers: {} };
        void client
          .respond(pending.serverRequestId, declinePayload)
          .catch(() => {});
        pendingUserInputRequests.delete(id);
      }
      await elicitationPauseController.endAll();
      unsubscribe();
      if (!secondaryReadOnly) {
        finishCodexTurn(codexExecutablePath, transientSecretClient);
      }
    }
  } finally {
    await deleteCodexSecondaryThread({
      enabled: secondaryReadOnly,
      threadId,
      request: client.request.bind(client),
    });
    if (secondaryReadOnly) {
      finishCodexTurn(codexExecutablePath, transientSecretClient);
    }
  }
}
