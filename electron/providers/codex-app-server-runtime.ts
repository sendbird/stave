import type {
  BridgeEvent,
  ProviderResponderResult,
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
  CodexConfigLayerSnapshot,
  CodexConfigOriginSnapshot,
  CodexConfigRequirementsSnapshot,
  CodexConfigSnapshot,
  CodexExternalAgentConfigMigrationItem,
  CodexModelCatalogEntry,
  CodexModelCatalogResponse,
  CodexMcpOauthLoginResponse,
  CodexMcpResourceReadResponse,
  CodexMcpServerStatusSnapshot,
  CodexMutationResponse,
  CodexPluginDetailResponse,
  CodexPluginDetailSnapshot,
  CodexPluginInstallResponse,
  CodexPluginMarketplaceSnapshot,
  CodexPluginSummarySnapshot,
  CodexReviewStartResponse,
  CodexSkillCatalogGroup,
  CodexThreadForkResponse,
  CodexThreadReadResponse,
  CodexThreadSnapshot,
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
  resolveProviderResumeSessionId,
} from "../../src/lib/providers/provider-request-translators";
import {
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "../../src/lib/providers/codex-runtime-options";
import { homedir } from "node:os";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { parseBooleanEnv, probeExecutableVersion } from "./runtime-shared";
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
} from "../../src/lib/providers/connected-tool-status";
import type { UserInputQuestion } from "../../src/types/chat";
import { getCodexMcpRegistrationStatus } from "../main/codex-mcp";
import { readPrimaryStaveLocalMcpManifest } from "../main/stave-local-mcp-manifest";
import {
  buildCodexDeveloperInstructions,
  buildCodexInstructionProfileKey,
} from "./codex-runtime-config";

const threadIdByTask = new Map<string, string>();
const clientByExecutablePath = new Map<string, CodexAppServerClient>();

const CODEX_HOME_DIRECTORY = process.env.HOME?.trim() || homedir();
const CODEX_SHARED_RUNTIME_DIRECTORIES = [
  `${CODEX_HOME_DIRECTORY}/.agents`,
  `${CODEX_HOME_DIRECTORY}/.codex`,
  `${CODEX_HOME_DIRECTORY}/.stave`,
] as const;
const APP_SERVER_INTERRUPT_GRACE_MS = 10_000;
const CODEX_APP_SERVER_STDOUT_BUFFER_MAX_BYTES = 32 * 1024 * 1024;
const CODEX_APP_SERVER_STDOUT_SOFT_LINE_MAX_BYTES = 1 * 1024 * 1024;
const CODEX_APP_SERVER_STDOUT_HARD_LINE_MAX_BYTES = 8 * 1024 * 1024;
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

interface ElicitationFieldDescriptor {
  key: string;
  kind: "text" | "number" | "integer" | "boolean" | "enum" | "multi_enum";
  optionValueByLabel?: Record<string, string>;
}

function resolveFileAccessMode(args: {
  runtimeValue?: "read-only" | "workspace-write" | "danger-full-access";
  envValue?: string;
  planMode?: boolean;
  fallback: "read-only" | "workspace-write" | "danger-full-access";
}) {
  return resolveEffectiveCodexFileAccessMode({
    fileAccessMode: args.runtimeValue ?? args.envValue,
    planMode: args.planMode,
    fallback: args.fallback,
  });
}

function resolveApprovalPolicy(args: {
  runtimeValue?: "never" | "on-request" | "untrusted";
  envValue?: string;
  planMode?: boolean;
  fallback?: "never" | "on-request" | "untrusted";
}): "never" | "on-request" | "untrusted" | undefined {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate !== "never" &&
    candidate !== "on-request" &&
    candidate !== "untrusted"
  ) {
    return args.fallback == null
      ? undefined
      : resolveEffectiveCodexApprovalPolicy({
          planMode: args.planMode,
          fallback: args.fallback,
        });
  }
  return resolveEffectiveCodexApprovalPolicy({
    approvalPolicy: candidate,
    planMode: args.planMode,
    fallback: args.fallback,
  });
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

function toCodexUserFacingErrorMessage(args: { message: string }) {
  const lower = args.message.toLowerCase();
  if (
    lower.includes("auth") ||
    lower.includes("api key") ||
    lower.includes("login") ||
    lower.includes("unauthorized")
  ) {
    return "Codex authentication failed. Run `codex login` and retry.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("insufficient_quota")
  ) {
    return "Codex rate limit/quota reached. Retry after reset or check account limits.";
  }
  if (lower.includes("billing") || lower.includes("payment")) {
    return "Codex billing/subscription issue detected. Check account payment status.";
  }
  if (
    lower.includes("stream disconnected") ||
    lower.includes("error sending request for url")
  ) {
    return "Codex network/model endpoint is unreachable. Check internet/proxy/firewall and retry.";
  }
  return args.message;
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

function buildCodexConfigOverrides(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const config: Record<string, string | boolean> = {};
  const developerInstructions = buildCodexDeveloperInstructions({
    runtimeOptions: args.runtimeOptions,
  });
  const summaryMode = args.runtimeOptions?.codexReasoningSummary;
  const supportsSummaries = args.runtimeOptions?.codexReasoningSummarySupport;
  const hasExplicitRawReasoningToggle = Object.prototype.hasOwnProperty.call(
    args.runtimeOptions ?? {},
    "codexShowRawReasoning",
  );

  if (developerInstructions) {
    config.developer_instructions = developerInstructions;
  }
  if (hasExplicitRawReasoningToggle) {
    config.show_raw_agent_reasoning = Boolean(
      args.runtimeOptions?.codexShowRawReasoning,
    );
  }
  if (summaryMode && summaryMode !== "auto") {
    config.model_reasoning_summary = summaryMode;
  }
  if (supportsSummaries === "enabled") {
    config.model_supports_reasoning_summaries = true;
  } else if (supportsSummaries === "disabled") {
    config.model_supports_reasoning_summaries = false;
  }
  if (typeof args.runtimeOptions?.codexNetworkAccess === "boolean") {
    config.network_access = args.runtimeOptions.codexNetworkAccess;
  }
  if (args.runtimeOptions?.codexWebSearch) {
    config.web_search = args.runtimeOptions.codexWebSearch;
  }
  const codexFastMode = args.runtimeOptions?.codexFastMode;
  if (codexFastMode !== undefined) {
    config["features.fast_mode"] = codexFastMode;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function buildThreadKey(args: {
  taskId?: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const model = args.runtimeOptions?.model?.trim() || "default";
  const mode = args.runtimeOptions?.codexPlanMode ? "plan" : "chat";
  const instructionProfile = buildCodexInstructionProfileKey({
    runtimeOptions: args.runtimeOptions,
  });
  return `${args.taskId ?? "default"}:${args.cwd}:${model}:${mode}:${instructionProfile}`;
}

function resolveThreadId(args: {
  threadKey: string;
  fallbackThreadId?: string;
}) {
  return threadIdByTask.get(args.threadKey) ?? args.fallbackThreadId?.trim();
}

function rememberThreadId(args: { threadKey: string; threadId?: string }) {
  const nextThreadId = args.threadId?.trim();
  if (!nextThreadId) {
    return;
  }
  threadIdByTask.set(args.threadKey, nextThreadId);
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

function isReadableDirectory(args: { path: string }) {
  try {
    accessSync(args.path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCodexExecutablePath(
  args: { explicitPath?: string } = {},
) {
  return resolveCodexCliExecutablePath({
    explicitPath: args.explicitPath,
  });
}

function resolveCodexAdditionalDirectories(args: {
  cwd: string;
  candidates?: readonly string[];
  pathExists?: (value: string) => boolean;
}) {
  const resolvedCwd = path.resolve(args.cwd);
  return (args.candidates ?? CODEX_SHARED_RUNTIME_DIRECTORIES)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => path.resolve(candidate))
    .filter((candidate, index, entries) => entries.indexOf(candidate) === index)
    .filter((candidate) => candidate !== resolvedCwd)
    .filter((candidate) => !resolvedCwd.startsWith(`${candidate}${path.sep}`))
    .filter((candidate) =>
      (
        args.pathExists ??
        ((value: string) => isReadableDirectory({ path: value }))
      )(candidate),
    );
}

function buildSandboxPolicy(args: {
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const planModeEnabled = args.runtimeOptions?.codexPlanMode === true;
  const networkAccessEnabled =
    args.runtimeOptions?.codexNetworkAccess ??
    parseBooleanEnv({
      value: process.env.STAVE_CODEX_NETWORK_ACCESS,
      fallback: false,
    });
  const fileAccessMode = resolveFileAccessMode({
    runtimeValue: args.runtimeOptions?.codexFileAccess,
    envValue: process.env.STAVE_CODEX_SANDBOX_MODE?.trim(),
    planMode: planModeEnabled,
    fallback: "workspace-write",
  });
  const readableRoots = [
    args.cwd,
    ...resolveCodexAdditionalDirectories({ cwd: args.cwd }),
  ];

  switch (fileAccessMode) {
    case "danger-full-access":
      return { type: "dangerFullAccess" as const };
    case "read-only":
      return {
        type: "readOnly" as const,
        access: {
          type: "restricted" as const,
          includePlatformDefaults: true,
          readableRoots,
        },
        networkAccess: networkAccessEnabled,
      };
    case "workspace-write":
    default:
      return {
        type: "workspaceWrite" as const,
        writableRoots: [args.cwd],
        readOnlyAccess: {
          type: "restricted" as const,
          includePlatformDefaults: true,
          readableRoots,
        },
        networkAccess: networkAccessEnabled,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
  }
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

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type CodexElicitationPauseClient = {
  request<T = unknown>(method: string, params: unknown): Promise<T>;
};

export function createCodexAppServerElicitationPauseController(args: {
  client: CodexElicitationPauseClient;
  threadId: string;
  debug?: boolean;
}) {
  const pendingRequestIds = new Set<string>();
  let queue = Promise.resolve();

  const enqueue = (operation: () => Promise<void>) => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  };

  const logFailure = (
    phase: "pause" | "resume",
    requestId: string,
    error: unknown,
  ) => {
    console.warn(
      `[provider-runtime] Codex app-server elicitation ${phase} failed`,
      {
        threadId: args.threadId,
        requestId,
        error: toErrorMessage(error),
      },
    );
  };

  const logState = (
    phase: "pause" | "resume",
    requestId: string,
    response: { count?: number; paused?: boolean } | undefined,
  ) => {
    if (!args.debug) {
      return;
    }
    console.debug(`[codex-app-server-runtime] elicitation ${phase} applied`, {
      threadId: args.threadId,
      requestId,
      count: response?.count,
      paused: response?.paused,
    });
  };

  return {
    begin(requestId: string) {
      return enqueue(async () => {
        if (!requestId || pendingRequestIds.has(requestId)) {
          return;
        }
        pendingRequestIds.add(requestId);
        try {
          const response = await args.client.request<{
            count?: number;
            paused?: boolean;
          }>("thread/increment_elicitation", {
            threadId: args.threadId,
          });
          logState("pause", requestId, response);
        } catch (error) {
          pendingRequestIds.delete(requestId);
          logFailure("pause", requestId, error);
        }
      });
    },
    end(requestId: string) {
      return enqueue(async () => {
        if (!requestId || !pendingRequestIds.delete(requestId)) {
          return;
        }
        try {
          const response = await args.client.request<{
            count?: number;
            paused?: boolean;
          }>("thread/decrement_elicitation", {
            threadId: args.threadId,
          });
          logState("resume", requestId, response);
        } catch (error) {
          logFailure("resume", requestId, error);
        }
      });
    },
    endAll() {
      return enqueue(async () => {
        const requestIds = [...pendingRequestIds];
        pendingRequestIds.clear();
        for (const requestId of requestIds) {
          try {
            const response = await args.client.request<{
              count?: number;
              paused?: boolean;
            }>("thread/decrement_elicitation", {
              threadId: args.threadId,
            });
            logState("resume", requestId, response);
          } catch (error) {
            logFailure("resume", requestId, error);
          }
        }
      });
    },
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  const error = params && isRecord(params.error) ? params.error : null;
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
      typeof params?.message === "string"
        ? params.message
        : typeof error?.message === "string"
          ? error.message
          : typeof turnError?.message === "string"
            ? turnError.message
            : undefined,
  };
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseStringOptions(args: {
  rawOptions: unknown;
  fallbackDescription?: string;
}) {
  if (!Array.isArray(args.rawOptions)) {
    return null;
  }
  const parsed = args.rawOptions.flatMap((option) => {
    if (typeof option === "string" && option.trim()) {
      return [
        {
          label: option.trim(),
          value: option.trim(),
          description: args.fallbackDescription ?? option.trim(),
        },
      ];
    }
    if (
      !isRecord(option) ||
      typeof option.const !== "string" ||
      !option.const.trim()
    ) {
      return [];
    }
    const value = option.const.trim();
    const label =
      typeof option.title === "string" && option.title.trim()
        ? option.title.trim()
        : value;
    return [
      {
        label,
        value,
        description: args.fallbackDescription ?? value,
      },
    ];
  });
  return parsed.length > 0 ? parsed : null;
}

function mapDefaultValueToLabel(args: {
  value: unknown;
  optionValueByLabel: Record<string, string>;
}) {
  if (typeof args.value !== "string") {
    return undefined;
  }
  const matched = Object.entries(args.optionValueByLabel).find(
    ([, optionValue]) => optionValue === args.value,
  );
  return matched?.[0];
}

function buildElicitationQuestionFromProperty(args: {
  formMessage: string;
  key: string;
  property: Record<string, unknown>;
  requiredKeys: Set<string>;
}): { question: UserInputQuestion; field: ElicitationFieldDescriptor } | null {
  const title = toTrimmedString(args.property.title) ?? args.key;
  const description =
    toTrimmedString(args.property.description) ?? `Provide ${title}.`;
  const required = args.requiredKeys.has(args.key);

  if (args.property.type === "boolean") {
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "boolean",
        options: [
          { label: "Yes", description: "true" },
          { label: "No", description: "false" },
        ],
        allowCustom: false,
        required,
        defaultValue:
          typeof args.property.default === "boolean"
            ? args.property.default
              ? "Yes"
              : "No"
            : undefined,
      },
      field: {
        key: args.key,
        kind: "boolean",
        optionValueByLabel: {
          Yes: "true",
          No: "false",
        },
      },
    };
  }

  if (args.property.type === "number" || args.property.type === "integer") {
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: args.property.type,
        options: [],
        allowCustom: true,
        required,
        placeholder: title,
        defaultValue:
          typeof args.property.default === "number"
            ? String(args.property.default)
            : undefined,
      },
      field: {
        key: args.key,
        kind: args.property.type,
      },
    };
  }

  if (args.property.type === "array" && isRecord(args.property.items)) {
    const options = parseStringOptions({
      rawOptions:
        args.property.items.anyOf ??
        args.property.items.oneOf ??
        args.property.items.enum,
      fallbackDescription: description,
    });
    if (!options) {
      return null;
    }
    const optionValueByLabel = Object.fromEntries(
      options.map((option) => [option.label, option.value]),
    );
    const defaultValue = Array.isArray(args.property.default)
      ? args.property.default
          .map(
            (value) =>
              mapDefaultValueToLabel({ value, optionValueByLabel }) ??
              (typeof value === "string" ? value : ""),
          )
          .filter(Boolean)
          .join(", ")
      : undefined;
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "text",
        options: options.map((option) => ({
          label: option.label,
          description: option.description,
        })),
        multiSelect: true,
        allowCustom: false,
        required,
        defaultValue,
      },
      field: {
        key: args.key,
        kind: "multi_enum",
        optionValueByLabel,
      },
    };
  }

  const scalarOptions = parseStringOptions({
    rawOptions:
      args.property.oneOf ?? args.property.anyOf ?? args.property.enum,
    fallbackDescription: description,
  });
  if (scalarOptions) {
    const optionValueByLabel = Object.fromEntries(
      scalarOptions.map((option) => [option.label, option.value]),
    );
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "text",
        options: scalarOptions.map((option) => ({
          label: option.label,
          description: option.description,
        })),
        allowCustom: false,
        required,
        defaultValue: mapDefaultValueToLabel({
          value: args.property.default,
          optionValueByLabel,
        }),
      },
      field: {
        key: args.key,
        kind: "enum",
        optionValueByLabel,
      },
    };
  }

  if (args.property.type === "string" || !("type" in args.property)) {
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "text",
        options: [],
        allowCustom: true,
        required,
        placeholder: title,
        defaultValue:
          typeof args.property.default === "string"
            ? args.property.default
            : undefined,
      },
      field: {
        key: args.key,
        kind: "text",
      },
    };
  }

  return null;
}

export function mapCodexElicitationToUserInput(
  params: Record<string, unknown>,
) {
  const mode = params.mode === "url" ? "url" : "form";
  const message =
    toTrimmedString(params.message) ??
    "Additional input is required to continue.";

  if (mode === "url") {
    const linkUrl = toTrimmedString(params.url);
    if (!linkUrl) {
      return null;
    }
    return {
      mode,
      questions: [
        {
          key: "__elicitation_url__",
          header: "MCP URL Elicitation",
          question: message,
          inputType: "url_notice" as const,
          options: [],
          allowCustom: false,
          required: false,
          linkUrl,
        },
      ],
      fields: [] as ElicitationFieldDescriptor[],
    };
  }

  const requestedSchema = isRecord(params.requestedSchema)
    ? params.requestedSchema
    : null;
  const properties =
    requestedSchema && isRecord(requestedSchema.properties)
      ? requestedSchema.properties
      : null;
  if (!properties) {
    return null;
  }
  if (Object.keys(properties).length === 0) {
    const meta = isRecord(params._meta) ? params._meta : null;
    const toolDescription =
      meta && typeof meta.tool_description === "string"
        ? meta.tool_description.trim()
        : "";
    return {
      mode,
      questions: [
        {
          key: "__elicitation_accept__",
          header: message,
          question:
            toolDescription ||
            "Submit to allow this MCP request, or decline to cancel it.",
          inputType: "text" as const,
          options: [],
          allowCustom: false,
          required: false,
        },
      ],
      fields: [] as ElicitationFieldDescriptor[],
    };
  }
  const requiredKeys = new Set(
    Array.isArray(requestedSchema.required)
      ? requestedSchema.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );

  const mapped = Object.entries(properties).flatMap(([key, property]) => {
    if (!isRecord(property)) {
      return [];
    }
    const question = buildElicitationQuestionFromProperty({
      formMessage: message,
      key,
      property,
      requiredKeys,
    });
    return question ? [question] : [];
  });

  if (mapped.length === 0) {
    return null;
  }

  return {
    mode,
    questions: mapped.map((entry) => entry.question),
    fields: mapped.map((entry) => entry.field),
  };
}

function inferCodexMcpToolName(args: {
  message: string;
  meta: Record<string, unknown> | null;
}) {
  const metaToolName =
    toTrimmedString(args.meta?.tool_name) ??
    toTrimmedString(args.meta?.toolName);
  if (metaToolName) {
    return metaToolName;
  }

  const quotedToolName = args.message
    .match(/tool\s+["'“”]([^"'“”]+)["'“”]/i)?.[1]
    ?.trim();
  return quotedToolName && quotedToolName.length > 0
    ? quotedToolName
    : "MCP tool";
}

export function mapCodexElicitationToApproval(params: Record<string, unknown>) {
  if ((params.mode === "url" ? "url" : "form") !== "form") {
    return null;
  }

  const message =
    toTrimmedString(params.message) ??
    "Additional input is required to continue.";
  const meta = isRecord(params._meta) ? params._meta : null;
  const approvalKind = toTrimmedString(meta?.codex_approval_kind);
  if (approvalKind !== "mcp_tool_call") {
    return null;
  }

  const requestedSchema = isRecord(params.requestedSchema)
    ? params.requestedSchema
    : null;
  const properties =
    requestedSchema && isRecord(requestedSchema.properties)
      ? requestedSchema.properties
      : null;
  if (!properties || Object.keys(properties).length !== 0) {
    return null;
  }

  const toolDescription =
    typeof meta?.tool_description === "string"
      ? meta.tool_description.trim()
      : "";

  return {
    toolName: inferCodexMcpToolName({ message, meta }),
    description: toolDescription || message,
  };
}

function coerceElicitationAnswer(args: {
  rawValue: string;
  field: ElicitationFieldDescriptor;
}) {
  const trimmed = args.rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  if (args.field.kind === "number") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (args.field.kind === "integer") {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  if (args.field.kind === "boolean") {
    const normalized =
      args.field.optionValueByLabel?.[trimmed] ?? trimmed.toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    return undefined;
  }
  if (args.field.kind === "multi_enum") {
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => args.field.optionValueByLabel?.[part] ?? part);
  }
  if (args.field.kind === "enum") {
    return args.field.optionValueByLabel?.[trimmed] ?? trimmed;
  }
  return trimmed;
}

function mapCodexMcpServerStatus(args: {
  toolId: ConnectedToolId;
  servers: CodexMcpServerStatus[];
}) {
  if (args.toolId === "github") {
    return createCodexConnectedToolStatusEntry({
      id: "github",
      state: "unknown",
      available: true,
      detail: "GitHub app status is not exposed by mcpServerStatus/list.",
    });
  }

  const serverName = args.toolId === "atlassian" ? "atlassian" : args.toolId;
  const server = args.servers.find(
    (candidate) => candidate.name.trim().toLowerCase() === serverName,
  );
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
        detail: `${getConnectedToolLabel(args.toolId)} is ready for Codex.`,
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
  private startupPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private pendingResponses = new Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private listeners = new Set<(message: JsonRpcMessage) => void>();
  private exitListeners = new Set<(message: string) => void>();
  private initialized = false;
  private lastErrorMessage: string | null = null;

  constructor(private readonly executablePath: string) {}

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

  /**
   * Register a callback that fires when the underlying app-server process
   * exits (or is torn down). Returns an unsubscribe function.
   */
  onProcessExit(listener: (message: string) => void) {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    await this.ensureStarted();
    return this.sendRequest<T>(method, params);
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

    const child = spawn(
      this.executablePath,
      ["app-server", "--listen", "stdio://"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: buildCodexEnv({ executablePath: this.executablePath }),
        cwd: process.cwd(),
      },
    );
    this.process = child;
    this.initialized = false;
    const stdoutLineBuffer = new Utf8LineBuffer({
      label: "codex-app-server stdout",
      maxBufferBytes: CODEX_APP_SERVER_STDOUT_BUFFER_MAX_BYTES,
      maxLineBytes: CODEX_APP_SERVER_STDOUT_HARD_LINE_MAX_BYTES,
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
  ): Promise<T> {
    const child = this.process;
    if (!child) {
      throw new Error("Codex App Server is not running.");
    }

    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      this.pendingResponses.set(requestId, { resolve, reject });
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
    const hasResponseId =
      Object.prototype.hasOwnProperty.call(message, "id") &&
      (Object.prototype.hasOwnProperty.call(message, "result") ||
        Object.prototype.hasOwnProperty.call(message, "error"));
    if (hasResponseId) {
      const id = message.id as JsonRpcId;
      const pending = this.pendingResponses.get(id);
      if (!pending) {
        return;
      }
      this.pendingResponses.delete(id);
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
    this.initialized = false;
    this.lastErrorMessage = message;
    if (current && !current.killed) {
      current.kill();
    }
    for (const pending of this.pendingResponses.values()) {
      pending.reject(new Error(message));
    }
    this.pendingResponses.clear();

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
  const key = args.executablePath.trim();
  const existing = clientByExecutablePath.get(key);
  if (existing) {
    return existing;
  }
  const client = new CodexAppServerClient(key);
  clientByExecutablePath.set(key, client);
  return client;
}

async function ensureCodexThread(args: {
  client: CodexAppServerClient;
  taskId?: string;
  cwd: string;
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const threadKey = buildThreadKey({
    taskId: args.taskId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
  });
  const resumeThreadId = resolveThreadId({
    threadKey,
    fallbackThreadId: resolveCodexResumeThreadFallback({
      conversation: args.conversation,
      runtimeOptions: args.runtimeOptions,
    }),
  });

  const config = buildCodexConfigOverrides({
    runtimeOptions: args.runtimeOptions,
  });
  const params = {
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    cwd: args.cwd,
    ...(config ? { config } : {}),
    experimentalRawEvents: true,
    persistExtendedHistory: true,
  };

  const response = resumeThreadId
    ? await args.client.request<{ thread: { id: string } }>("thread/resume", {
        threadId: resumeThreadId,
        ...params,
      })
    : await args.client.request<{ thread: { id: string } }>(
        "thread/start",
        params,
      );
  const threadId = response.thread.id;
  rememberThreadId({ threadKey, threadId });
  return { threadId, threadKey };
}

export function cleanupCodexAppServerTask(taskId: string) {
  const keyPrefix = `${taskId}:`;
  for (const threadKey of threadIdByTask.keys()) {
    if (threadKey.startsWith(keyPrefix)) {
      threadIdByTask.delete(threadKey);
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
  return getCodexAppServerClient({ executablePath });
}

function toCodexStatusLabel(status: unknown) {
  if (!status || typeof status !== "object") {
    return "unknown";
  }
  const type = (status as { type?: unknown }).type;
  return typeof type === "string" ? type : "unknown";
}

function toCodexSourceLabel(source: unknown) {
  if (typeof source === "string") {
    return source;
  }
  if (!source || typeof source !== "object") {
    return "unknown";
  }
  const sourceRecord = source as Record<string, unknown>;
  if (typeof sourceRecord.custom === "string") {
    return `custom:${sourceRecord.custom}`;
  }
  const subAgent = sourceRecord.subAgent;
  if (subAgent != null) {
    return `subAgent:${String(subAgent)}`;
  }
  if (typeof sourceRecord.type === "string") {
    const detail = [
      sourceRecord.id,
      sourceRecord.name,
      sourceRecord.label,
    ].find(
      (value) =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean",
    );
    return detail == null
      ? sourceRecord.type
      : `${sourceRecord.type}:${String(detail)}`;
  }
  const firstScalarEntry = Object.entries(sourceRecord).find(
    ([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean",
  );
  if (firstScalarEntry) {
    const [key, value] = firstScalarEntry;
    return `${key}:${String(value)}`;
  }
  return "unknown";
}

export function toCodexConfigLayerDisplayValue(
  value: unknown,
  fallback = "unknown",
) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => toCodexConfigLayerDisplayValue(entry, ""))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : fallback;
  }
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const pickScalar = (...entries: unknown[]) =>
    entries.find(
      (entry) =>
        (typeof entry === "string" && entry.trim().length > 0) ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    );
  const detail = pickScalar(
    record.displayName,
    record.label,
    record.title,
    record.path,
    record.id,
    record.name,
  );
  const kind = pickScalar(
    record.kind,
    record.type,
    record.scope,
    record.source,
  );
  if (detail != null) {
    const detailLabel =
      typeof detail === "string" ? detail.trim() : String(detail);
    if (kind != null) {
      const kindLabel = typeof kind === "string" ? kind.trim() : String(kind);
      if (kindLabel.length > 0 && kindLabel !== detailLabel) {
        return `${kindLabel}:${detailLabel}`;
      }
    }
    return detailLabel;
  }
  const firstScalarEntry = Object.entries(record).find(
    ([, entry]) =>
      (typeof entry === "string" && entry.trim().length > 0) ||
      typeof entry === "number" ||
      typeof entry === "boolean",
  );
  if (firstScalarEntry) {
    const [key, entry] = firstScalarEntry;
    const entryLabel = typeof entry === "string" ? entry.trim() : String(entry);
    return `${key}:${entryLabel}`;
  }
  const fallbackText = toText(value);
  if (!fallbackText || fallbackText === "{}" || fallbackText === "null") {
    return fallback;
  }
  return fallbackText.length > 180
    ? `${fallbackText.slice(0, 179)}…`
    : fallbackText;
}

function mapCodexModelCatalogEntry(model: any): CodexModelCatalogEntry {
  return {
    id: String(model?.id ?? model?.model ?? ""),
    model: String(model?.model ?? ""),
    displayName: String(model?.displayName ?? model?.model ?? ""),
    description:
      typeof model?.description === "string" ? model.description : "",
    hidden: Boolean(model?.hidden),
    isDefault: Boolean(model?.isDefault),
    supportsPersonality: Boolean(model?.supportsPersonality),
    defaultReasoningEffort:
      typeof model?.defaultReasoningEffort === "string"
        ? model.defaultReasoningEffort
        : "medium",
    supportedReasoningEfforts: Array.isArray(model?.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts
          .map((entry: any) =>
            typeof entry === "string"
              ? entry
              : typeof entry?.value === "string"
                ? entry.value
                : "",
          )
          .filter(Boolean)
      : [],
    inputModalities: Array.isArray(model?.inputModalities)
      ? model.inputModalities
          .map((entry: unknown) => String(entry ?? "").trim())
          .filter(Boolean)
      : [],
    additionalSpeedTiers: Array.isArray(model?.additionalSpeedTiers)
      ? model.additionalSpeedTiers
          .map((entry: unknown) => String(entry ?? "").trim())
          .filter(Boolean)
      : [],
    upgrade: typeof model?.upgrade === "string" ? model.upgrade : null,
    upgradeInfo:
      model?.upgradeInfo && typeof model.upgradeInfo === "object"
        ? {
            model: String(model.upgradeInfo.model ?? ""),
            upgradeCopy:
              typeof model.upgradeInfo.upgradeCopy === "string"
                ? model.upgradeInfo.upgradeCopy
                : null,
            modelLink:
              typeof model.upgradeInfo.modelLink === "string"
                ? model.upgradeInfo.modelLink
                : null,
            migrationMarkdown:
              typeof model.upgradeInfo.migrationMarkdown === "string"
                ? model.upgradeInfo.migrationMarkdown
                : null,
          }
        : null,
    availabilityNux:
      typeof model?.availabilityNux?.message === "string"
        ? model.availabilityNux.message
        : typeof model?.availabilityNux === "string"
          ? model.availabilityNux
          : null,
  };
}

function mapCodexMcpStatusSnapshot(server: any): CodexMcpServerStatusSnapshot {
  const tools =
    server?.tools && typeof server.tools === "object"
      ? Object.values(server.tools).map((tool: any) => ({
          name: String(tool?.name ?? ""),
          ...(typeof tool?.title === "string" ? { title: tool.title } : {}),
          ...(typeof tool?.description === "string"
            ? { description: tool.description }
            : {}),
        }))
      : [];
  const resources = Array.isArray(server?.resources)
    ? server.resources.map((resource: any) => ({
        uri: String(resource?.uri ?? ""),
        name: String(resource?.name ?? resource?.title ?? resource?.uri ?? ""),
        ...(typeof resource?.title === "string"
          ? { title: resource.title }
          : {}),
        ...(typeof resource?.description === "string"
          ? { description: resource.description }
          : {}),
        ...(typeof resource?.mimeType === "string"
          ? { mimeType: resource.mimeType }
          : {}),
      }))
    : [];
  const resourceTemplates = Array.isArray(server?.resourceTemplates)
    ? server.resourceTemplates.map((template: any) => ({
        uriTemplate: String(template?.uriTemplate ?? ""),
        name: String(
          template?.name ?? template?.title ?? template?.uriTemplate ?? "",
        ),
        ...(typeof template?.title === "string"
          ? { title: template.title }
          : {}),
        ...(typeof template?.description === "string"
          ? { description: template.description }
          : {}),
        ...(typeof template?.mimeType === "string"
          ? { mimeType: template.mimeType }
          : {}),
      }))
    : [];

  return {
    name: String(server?.name ?? ""),
    enabled: true,
    disabledReason: null,
    transportType:
      typeof server?.transportType === "string" ? server.transportType : "mcp",
    url: typeof server?.url === "string" ? server.url : null,
    bearerTokenEnvVar:
      typeof server?.bearerTokenEnvVar === "string"
        ? server.bearerTokenEnvVar
        : null,
    authStatus:
      typeof server?.authStatus === "string"
        ? server.authStatus
        : typeof server?.authStatus?.type === "string"
          ? server.authStatus.type
          : null,
    startupTimeoutSec:
      typeof server?.startupTimeoutSec === "number"
        ? server.startupTimeoutSec
        : null,
    toolTimeoutSec:
      typeof server?.toolTimeoutSec === "number" ? server.toolTimeoutSec : null,
    ...(tools.length > 0 ? { tools } : {}),
    ...(resources.length > 0 ? { resources } : {}),
    ...(resourceTemplates.length > 0 ? { resourceTemplates } : {}),
  };
}

function mapCodexPluginSummary(
  plugin: any,
  marketplace: any,
): CodexPluginSummarySnapshot {
  return {
    id: String(plugin?.id ?? ""),
    name: String(plugin?.name ?? ""),
    marketplaceName: String(marketplace?.name ?? ""),
    marketplacePath: String(marketplace?.path ?? ""),
    marketplaceDisplayName:
      typeof marketplace?.interface?.displayName === "string"
        ? marketplace.interface.displayName
        : null,
    source: toCodexSourceLabel(plugin?.source),
    installed: Boolean(plugin?.installed),
    enabled: Boolean(plugin?.enabled),
    installPolicy:
      typeof plugin?.installPolicy === "string"
        ? plugin.installPolicy
        : "unknown",
    authPolicy:
      typeof plugin?.authPolicy === "string" ? plugin.authPolicy : "unknown",
  };
}

function mapCodexPluginDetail(plugin: any): CodexPluginDetailSnapshot {
  return {
    marketplaceName: String(plugin?.marketplaceName ?? ""),
    marketplacePath: String(plugin?.marketplacePath ?? ""),
    id: String(plugin?.summary?.id ?? ""),
    name: String(plugin?.summary?.name ?? ""),
    source: toCodexSourceLabel(plugin?.summary?.source),
    installed: Boolean(plugin?.summary?.installed),
    enabled: Boolean(plugin?.summary?.enabled),
    installPolicy:
      typeof plugin?.summary?.installPolicy === "string"
        ? plugin.summary.installPolicy
        : "unknown",
    authPolicy:
      typeof plugin?.summary?.authPolicy === "string"
        ? plugin.summary.authPolicy
        : "unknown",
    description:
      typeof plugin?.description === "string" ? plugin.description : null,
    skills: Array.isArray(plugin?.skills)
      ? plugin.skills.map((skill: any) => ({
          name: String(skill?.name ?? ""),
          description: String(skill?.description ?? ""),
          shortDescription:
            typeof skill?.shortDescription === "string"
              ? skill.shortDescription
              : null,
          path: String(skill?.path ?? ""),
          enabled: Boolean(skill?.enabled),
        }))
      : [],
    apps: Array.isArray(plugin?.apps)
      ? plugin.apps.map((app: any) => ({
          id: String(app?.id ?? ""),
          name: String(app?.name ?? ""),
          description:
            typeof app?.description === "string" ? app.description : null,
          installUrl:
            typeof app?.installUrl === "string" ? app.installUrl : null,
          needsAuth: Boolean(app?.needsAuth),
        }))
      : [],
    mcpServers: Array.isArray(plugin?.mcpServers)
      ? plugin.mcpServers
          .map((server: unknown) => String(server ?? "").trim())
          .filter(Boolean)
      : [],
  };
}

function mapCodexThreadSnapshot(
  thread: any,
  archived: boolean,
): CodexThreadSnapshot {
  return {
    id: String(thread?.id ?? ""),
    forkedFromId:
      typeof thread?.forkedFromId === "string" ? thread.forkedFromId : null,
    preview: typeof thread?.preview === "string" ? thread.preview : "",
    modelProvider:
      typeof thread?.modelProvider === "string"
        ? thread.modelProvider
        : "openai",
    createdAt: typeof thread?.createdAt === "number" ? thread.createdAt : 0,
    updatedAt: typeof thread?.updatedAt === "number" ? thread.updatedAt : 0,
    status: toCodexStatusLabel(thread?.status),
    cwd: typeof thread?.cwd === "string" ? thread.cwd : "",
    cliVersion: typeof thread?.cliVersion === "string" ? thread.cliVersion : "",
    source: toCodexSourceLabel(thread?.source),
    agentNickname:
      typeof thread?.agentNickname === "string" ? thread.agentNickname : null,
    agentRole: typeof thread?.agentRole === "string" ? thread.agentRole : null,
    name: typeof thread?.name === "string" ? thread.name : null,
    archived,
  };
}

function mapCodexConfigSnapshot(response: any): CodexConfigSnapshot {
  const origins: Record<string, CodexConfigOriginSnapshot> = {};
  if (response?.origins && typeof response.origins === "object") {
    for (const [key, origin] of Object.entries(response.origins)) {
      origins[key] = {
        name: String((origin as any)?.name ?? ""),
        version: String((origin as any)?.version ?? ""),
      };
    }
  }

  return {
    config:
      response?.config && typeof response.config === "object"
        ? (response.config as Record<string, unknown>)
        : {},
    origins,
    layers: Array.isArray(response?.layers)
      ? response.layers.map(
          (layer: any): CodexConfigLayerSnapshot => ({
            name: toCodexConfigLayerDisplayValue(layer?.name),
            version: toCodexConfigLayerDisplayValue(layer?.version, ""),
            disabledReason:
              typeof layer?.disabledReason === "string"
                ? layer.disabledReason
                : null,
            config: layer?.config ?? null,
          }),
        )
      : [],
  };
}

async function listPaginatedCodexData<T>(args: {
  client: CodexAppServerClient;
  method: string;
  params?: Record<string, unknown>;
  maxPages?: number;
}): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = args.maxPages ?? 10;
  while (pages < maxPages) {
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

export async function getCodexAppServerSnapshot(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexAppServerSnapshotResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const cwd = args.cwd?.trim() || process.cwd();
    const snapshot: CodexAppServerSnapshot = {
      account: null,
      rateLimits: [],
      skills: [],
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
        const response = await client.request<any>(
          "account/rateLimits/read",
          {},
        );
        const buckets =
          response?.rateLimitsByLimitId &&
          typeof response.rateLimitsByLimitId === "object"
            ? Object.values(response.rateLimitsByLimitId)
            : response?.rateLimits
              ? [response.rateLimits]
              : [];
        snapshot.rateLimits = buckets.map((bucket: any) => ({
          limitId: typeof bucket?.limitId === "string" ? bucket.limitId : null,
          limitName:
            typeof bucket?.limitName === "string" ? bucket.limitName : null,
          planType:
            typeof bucket?.planType === "string" ? bucket.planType : null,
          primary: bucket?.primary
            ? {
                usedPercent:
                  typeof bucket.primary.usedPercent === "number"
                    ? bucket.primary.usedPercent
                    : 0,
                windowDurationMins:
                  typeof bucket.primary.windowDurationMins === "number"
                    ? bucket.primary.windowDurationMins
                    : null,
                resetsAt:
                  typeof bucket.primary.resetsAt === "number"
                    ? bucket.primary.resetsAt
                    : null,
              }
            : null,
          secondary: bucket?.secondary
            ? {
                usedPercent:
                  typeof bucket.secondary.usedPercent === "number"
                    ? bucket.secondary.usedPercent
                    : 0,
                windowDurationMins:
                  typeof bucket.secondary.windowDurationMins === "number"
                    ? bucket.secondary.windowDurationMins
                    : null,
                resetsAt:
                  typeof bucket.secondary.resetsAt === "number"
                    ? bucket.secondary.resetsAt
                    : null,
              }
            : null,
          credits: bucket?.credits
            ? {
                hasCredits: Boolean(bucket.credits.hasCredits),
                unlimited: Boolean(bucket.credits.unlimited),
                balance:
                  typeof bucket.credits.balance === "string"
                    ? bucket.credits.balance
                    : null,
              }
            : null,
        }));
      }),
      loadSection("skills", async () => {
        const response = await client.request<any>("skills/list", {
          cwds: [cwd],
          forceReload: false,
        });
        snapshot.skills = Array.isArray(response?.data)
          ? response.data.map(
              (entry: any): CodexSkillCatalogGroup => ({
                cwd: String(entry?.cwd ?? cwd),
                skills: Array.isArray(entry?.skills)
                  ? entry.skills.map((skill: any) => ({
                      name: String(skill?.name ?? ""),
                      description: String(skill?.description ?? ""),
                      shortDescription:
                        typeof skill?.shortDescription === "string"
                          ? skill.shortDescription
                          : typeof skill?.interface?.short_description ===
                              "string"
                            ? skill.interface.short_description
                            : null,
                      path: String(skill?.path ?? ""),
                      scope:
                        typeof skill?.scope === "string"
                          ? skill.scope
                          : "unknown",
                      enabled: Boolean(skill?.enabled),
                    }))
                  : [],
                errors: Array.isArray(entry?.errors)
                  ? entry.errors.map((error: any) =>
                      typeof error?.message === "string"
                        ? error.message
                        : JSON.stringify(error ?? {}),
                    )
                  : [],
              }),
            )
          : [];
      }),
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

export async function startCodexMcpOauthLogin(args: {
  name: string;
  scopes?: string[];
  timeoutSecs?: number;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMcpOauthLoginResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("mcpServer/oauth/login", {
      name: args.name,
      ...(args.scopes?.length ? { scopes: args.scopes } : {}),
      ...(typeof args.timeoutSecs === "number"
        ? { timeoutSecs: args.timeoutSecs }
        : {}),
    });
    return {
      ok: true,
      detail: `Started MCP OAuth login for ${args.name}.`,
      authorizationUrl:
        typeof response?.authorizationUrl === "string"
          ? response.authorizationUrl
          : undefined,
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

export async function readCodexMcpResource(args: {
  threadId: string;
  server: string;
  uri: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexMcpResourceReadResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("mcpServer/resource/read", {
      threadId: args.threadId,
      server: args.server,
      uri: args.uri,
    });
    return {
      ok: true,
      detail: `Read MCP resource ${args.uri}.`,
      contents: Array.isArray(response?.contents)
        ? response.contents.map((content: any) => ({
            uri: String(content?.uri ?? args.uri),
            ...(typeof content?.mimeType === "string"
              ? { mimeType: content.mimeType }
              : {}),
            ...(typeof content?.text === "string"
              ? { text: content.text }
              : {}),
            ...(typeof content?.blob === "string"
              ? { blob: content.blob }
              : {}),
          }))
        : [],
    };
  } catch (error) {
    return {
      ok: false,
      detail: toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      }),
      contents: [],
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
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexThreadForkResponse> {
  try {
    const client = getCodexAppServerClientFromRuntimeOptions(args);
    const response = await client.request<any>("thread/fork", {
      threadId: args.threadId,
    });
    return {
      ok: true,
      detail: "Forked Codex thread.",
      threadId:
        typeof response?.thread?.id === "string"
          ? response.thread.id
          : typeof response?.threadId === "string"
            ? response.threadId
            : undefined,
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
    const client = getCodexAppServerClient({ executablePath });
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
  },
): Promise<BridgeEvent[] | null> {
  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const codexExecutablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
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

  const client = getCodexAppServerClient({
    executablePath: codexExecutablePath,
  });
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
    return events;
  }

  const { threadId } = await ensureCodexThread({
    client,
    taskId: args.taskId,
    cwd: runtimeCwd,
    conversation: args.conversation,
    runtimeOptions: args.runtimeOptions,
  });

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
    } else if (!hasEmittedDone && events[events.length - 1]?.type !== "done") {
      const doneEvent: BridgeEvent = { type: "done" };
      eventCollector.appendTail(doneEvent);
      args.onEvent?.(doneEvent);
    }
    return events;
  };

  emitBridgeEvents(buildCodexThreadStartedEvents({ threadId }));
  const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
  const hasEmbeddedStaveLocalMcp = await hasConnectedStaveLocalMcpForCodex();

  const providerPrompt = buildProviderTurnPrompt({
    providerId: args.providerId,
    prompt: args.prompt,
    conversation: args.conversation
      ? filterPromptRetrievedContext({
          conversation: args.conversation,
          excludedSourceIds: hasEmbeddedStaveLocalMcp
            ? []
            : ["stave:current-task-awareness"],
        })
      : args.conversation,
  });

  const toolOutputBuffers = new Map<string, string>();
  const toolOutputLastEmitAt = new Map<string, number>();
  const agentMessageBuffers = new Map<string, string>();
  const streamedAgentMessageIds = new Set<string>();
  const streamedReasoningIds = new Set<string>();
  const planBuffers = new Map<string, string>();
  const planLastEmitAt = new Map<string, number>();
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
    args.runtimeOptions?.debug ?? process.env.STAVE_CODEX_DEBUG === "1";
  const elicitationPauseController =
    createCodexAppServerElicitationPauseController({
      client,
      threadId,
      debug: codexDebug,
    });
  const waitForTurnCompletion = new Promise<void>((resolve) => {
    resolveTurnCompletion = resolve;
  });

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
      !args.runtimeOptions?.codexPlanMode ||
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
      const requestId = String(message.id);
      switch (message.method as ServerRequestMethod) {
        case "item/commandExecution/requestApproval": {
          const params = (message.params ?? {}) as Record<string, unknown>;
          pendingApprovalRequests.set(requestId, {
            serverRequestId: message.id as JsonRpcId,
            responseKind: "commandExecution",
          });
          void elicitationPauseController.begin(requestId);
          emitBridgeEvent({
            type: "approval",
            toolName: "bash",
            requestId,
            description: buildApprovalDescription({
              method: "item/commandExecution/requestApproval",
              params,
            }),
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
          pendingApprovalRequests.set(requestId, {
            serverRequestId: message.id as JsonRpcId,
            responseKind: "review",
          });
          void elicitationPauseController.begin(requestId);
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
          if (approval) {
            pendingApprovalRequests.set(requestId, {
              serverRequestId: message.id as JsonRpcId,
              responseKind: "elicitation",
            });
            void elicitationPauseController.begin(requestId);
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
              message: "Codex MCP elicitation could not be rendered by Stave.",
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
          const params = (message.params ?? {}) as CodexChatgptAuthTokensRefreshParams;
          void (async () => {
            try {
              const response = await refreshCodexChatgptAuthTokens({
                executablePath: codexExecutablePath,
                previousAccountId: params.previousAccountId,
              });
              await client.respond(message.id as JsonRpcId, response);
            } catch (error) {
              const messageText = toCodexUserFacingErrorMessage({
                message: error instanceof Error ? error.message : String(error),
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
    if (
      typeof params.turnId === "string" &&
      appServerTurnId &&
      params.turnId !== appServerTurnId
    ) {
      return;
    }
    if (typeof params.threadId === "string" && params.threadId !== threadId) {
      return;
    }

    switch (message.method) {
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
        emitBridgeEvent({
          type: "subagent_progress",
          ...(itemId ? { toolUseId: itemId } : {}),
          content: progressMessage,
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
          typeof params.message === "string"
            ? params.message
            : "Codex App Server error.";
        emitBridgeEvent({
          type: "error",
          message: toCodexUserFacingErrorMessage({ message: errorMessage }),
          recoverable: true,
        });
        return;
      }
      case "item/completed": {
        const item = params.item as { type?: string; id?: string } | undefined;
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
            if (args.runtimeOptions?.codexPlanMode) {
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
            const mcpItem = item as {
              server?: string;
              tool?: string;
              arguments?: unknown;
              result?: unknown;
              error?: { message?: string | null } | null;
              status?: string;
            };
            const toolLabel = `${mcpItem.server ?? "mcp"}:${mcpItem.tool ?? "tool"}`;
            emitBridgeEvents([
              {
                type: "tool",
                ...(itemId ? { toolUseId: itemId } : {}),
                toolName: toolLabel,
                input: toText(mcpItem.arguments ?? {}),
                state: "input-available",
              },
              {
                type: "tool_result",
                tool_use_id: itemId,
                output: mcpItem.error?.message
                  ? `[error] ${mcpItem.error.message}`
                  : toText(mcpItem.result ?? ""),
                ...(mcpItem.status === "failed" ? { isError: true } : {}),
              },
            ]);
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
        if (args.runtimeOptions?.codexPlanMode && !sawNativePlan) {
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
    const approvalPolicy = resolveApprovalPolicy({
      runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
      envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
      planMode: args.runtimeOptions?.codexPlanMode === true,
      fallback: "untrusted",
    });

    // Race turn/start against waitForTurnCompletion so an abort (or
    // process death) during the request isn't blocked until the outer
    // 3-hour timeout.
    const turnStartPromise = client.request<{ turn: { id: string } }>(
      "turn/start",
      {
        threadId,
        input: [
          {
            type: "text",
            text: providerPrompt,
            text_elements: [],
          },
        ],
        cwd: runtimeCwd,
        ...(approvalPolicy ? { approvalPolicy } : {}),
        sandboxPolicy: buildSandboxPolicy({
          cwd: runtimeCwd,
          runtimeOptions: args.runtimeOptions,
        }),
        ...(args.runtimeOptions?.model
          ? { model: args.runtimeOptions.model }
          : {}),
        ...(args.runtimeOptions?.codexReasoningEffort
          ? { effort: args.runtimeOptions.codexReasoningEffort }
          : {}),
        ...(args.runtimeOptions?.codexReasoningSummary
          ? { summary: args.runtimeOptions.codexReasoningSummary }
          : {}),
        ...(args.runtimeOptions?.codexPlanMode
          ? {
              collaborationMode: {
                mode: "plan",
                settings: {
                  model: args.runtimeOptions?.model?.trim() || "gpt-5.5",
                  reasoning_effort:
                    args.runtimeOptions?.codexReasoningEffort ?? null,
                  developer_instructions:
                    buildCodexDeveloperInstructions({
                      runtimeOptions: args.runtimeOptions,
                    }) ?? null,
                },
              },
            }
          : {}),
      },
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
  }
}
