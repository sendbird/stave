import type { BridgeEvent, StreamTurnArgs } from "./types";
import type {
  Thread,
  ThreadEvent,
  ThreadItem,
  TurnCompletedEvent,
  TurnOptions,
} from "@openai/codex-sdk";
import type {
  ConnectedToolId,
  ConnectedToolStatusEntry,
  ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";
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
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { parseBooleanEnv, probeExecutableVersion } from "./runtime-shared";
import { runCommandArgs } from "../main/utils/command";
import {
  getConnectedToolLabel,
  normalizeConnectedToolIds,
} from "../../src/lib/providers/connected-tool-status";
import { readPrimaryStaveLocalMcpManifestSync } from "../main/stave-local-mcp-manifest";
import {
  CODEX_STAVE_MCP_TOKEN_ENV_VAR,
  getCodexMcpRegistrationStatus,
} from "../main/codex-mcp";
import {
  buildCodexDeveloperInstructions,
  buildCodexInstructionProfileKey,
} from "./codex-runtime-config";
import {
  createBoundedBridgeEventCollector,
  measureBridgeEventBytes,
} from "./provider-buffering";

const threadByTask = new Map<string, Thread>();
const threadIdByTask = new Map<string, string>();
const threadLastUsedAt = new Map<string, number>();

/** Maximum number of cached threads before LRU eviction kicks in. */
const MAX_CACHED_THREADS = 24;

const SUPPORTED_CODEX_SDK_VERSION = "0.118.0";
const SUPPORTED_CODEX_CLI_VERSION = "0.118.0";
const CODEX_HOME_DIRECTORY = process.env.HOME?.trim() || homedir();
const CODEX_SHARED_RUNTIME_DIRECTORIES = [
  `${CODEX_HOME_DIRECTORY}/.codex`,
  `${CODEX_HOME_DIRECTORY}/.stave`,
] as const;
const CODEX_EVENT_RETAINED_BYTES_MAX = 2 * 1024 * 1024;
const CODEX_OVERFLOW_TAIL_EVENTS: BridgeEvent[] = [
  {
    type: "error",
    message:
      "Codex turn output was truncated in non-stream replay because the retained snapshot limit was exceeded.",
    recoverable: true,
  },
  { type: "done", stop_reason: "output_overflow" },
];
const CODEX_OVERFLOW_TAIL_BYTES = CODEX_OVERFLOW_TAIL_EVENTS.reduce(
  (total, event) => total + measureBridgeEventBytes(event),
  0,
);

interface CodexMcpServerListEntry {
  name: string;
  enabled?: boolean;
  disabled_reason?: string | null;
  transport?: {
    bearer_token_env_var?: string | null;
  } | null;
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

export function resolveApprovalPolicy(args: {
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
    lower.includes("failed to refresh available models") ||
    lower.includes("stream disconnected") ||
    lower.includes("error sending request for url")
  ) {
    return "Codex network/model endpoint is unreachable. Check internet/proxy/firewall and retry.";
  }
  if (lower.includes("no prompt provided via stdin")) {
    return "Codex CLI did not receive prompt input. Check Codex CLI version and retry.";
  }
  return args.message;
}

export function buildCodexEnv(args: { executablePath?: string } = {}) {
  return buildCodexCliEnv({ executablePath: args.executablePath });
}

async function hasConnectedStaveLocalMcpForCodex() {
  const manifest = readPrimaryStaveLocalMcpManifestSync();
  if (!manifest) {
    return false;
  }
  const status = await getCodexMcpRegistrationStatus({
    autoRegister: false,
    manifest,
  });
  return (
    status.installed &&
    status.matchesCurrentManifest &&
    status.url === manifest.url &&
    status.bearerTokenEnvVar === CODEX_STAVE_MCP_TOKEN_ENV_VAR
  );
}

function buildCodexDiagnostics(args: {
  executablePath: string;
  taskId?: string;
}) {
  const env = buildCodexEnv({ executablePath: args.executablePath });
  const versionProbe = args.executablePath
    ? probeExecutableVersion({
        executablePath: args.executablePath,
        env,
      })
    : null;
  return {
    taskId: args.taskId ?? "default",
    executablePath: args.executablePath || "<unresolved>",
    supportedSdkVersion: SUPPORTED_CODEX_SDK_VERSION,
    supportedCliVersion: SUPPORTED_CODEX_CLI_VERSION,
    versionProbe: versionProbe
      ? {
          status: versionProbe.status,
          signal: versionProbe.signal,
          error: versionProbe.error,
          stdout: versionProbe.stdout,
          stderr: versionProbe.stderr,
        }
      : null,
  };
}

export function buildCodexConfigOverrides(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const config: Record<string, string | boolean> = {};
  const planModeEnabled = args.runtimeOptions?.codexPlanMode === true;
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

  const codexFastMode = args.runtimeOptions?.codexFastMode;
  if (codexFastMode !== undefined) {
    config["features.fast_mode"] = codexFastMode;
  }
  if (planModeEnabled) {
    config.collaboration_mode_kind = "plan";
    if (args.runtimeOptions?.codexReasoningEffort) {
      config.plan_mode_reasoning_effort =
        args.runtimeOptions.codexReasoningEffort;
    }
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

export function resolveCodexResumeThreadFallback(args: {
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  return resolveProviderResumeSessionId({
    conversation: args.conversation,
    fallbackResumeId: args.runtimeOptions?.codexResumeThreadId,
  });
}

export function buildCodexThreadStartedEvents(args: {
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

export function resolveCodexAdditionalDirectories(args: {
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

export function resolveCodexExecutablePath(
  args: { explicitPath?: string } = {},
) {
  return resolveCodexCliExecutablePath({
    explicitPath: args.explicitPath,
  });
}

export function parseCodexMcpServerListJson(args: { stdout: string }) {
  const trimmed = args.stdout.trim();
  if (!trimmed) {
    return null;
  }

  const jsonStart = trimmed.indexOf("[");
  if (jsonStart < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart)) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((entry): entry is CodexMcpServerListEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const candidate = entry as Record<string, unknown>;
      return typeof candidate.name === "string";
    });
  } catch {
    return null;
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

function mapCodexConnectedToolStatus(args: {
  toolId: ConnectedToolId;
  servers: CodexMcpServerListEntry[];
  env: Record<string, string>;
}) {
  if (args.toolId === "github") {
    return createCodexConnectedToolStatusEntry({
      id: "github",
      state: "unknown",
      available: true,
      detail: "GitHub tool status is not exposed by `codex mcp list`.",
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

  if (server.enabled === false) {
    return createCodexConnectedToolStatusEntry({
      id: args.toolId,
      state: "disabled",
      available: false,
      detail:
        server.disabled_reason?.trim() ||
        `${getConnectedToolLabel(args.toolId)} is disabled in Codex MCP config.`,
    });
  }

  const bearerTokenEnvVar = server.transport?.bearer_token_env_var?.trim();
  if (bearerTokenEnvVar && !args.env[bearerTokenEnvVar]?.trim()) {
    return createCodexConnectedToolStatusEntry({
      id: args.toolId,
      state: "needs-auth",
      available: false,
      detail: `Missing ${bearerTokenEnvVar} in the Codex runtime environment.`,
    });
  }

  return createCodexConnectedToolStatusEntry({
    id: args.toolId,
    state: "ready",
    available: true,
    detail: `${getConnectedToolLabel(args.toolId)} is configured for Codex.`,
  });
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
    const detail =
      "Codex executable not found from runtime override, env vars, login-shell PATH, or home-bin candidates.";
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

  const env = buildCodexEnv({ executablePath });
  const result = await runCommandArgs({
    command: executablePath,
    commandArgs: ["mcp", "list", "--json"],
    cwd: args.cwd,
    env,
  });
  const servers = parseCodexMcpServerListJson({ stdout: result.stdout });
  const detail = result.ok
    ? `Loaded Codex MCP status from ${executablePath}.`
    : `Codex MCP status check failed: ${(result.stderr || result.stdout).trim() || "unknown error"}`;

  if (!result.ok || !servers) {
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

  return {
    ok: true,
    providerId: "codex",
    detail,
    tools: toolIds.map((toolId) =>
      mapCodexConnectedToolStatus({
        toolId,
        servers,
        env,
      }),
    ),
  };
}

// Tracks accumulated text length per item to emit only deltas for streaming.
const codexItemTextLength = new Map<string, number>();
const codexItemLastEmitTime = new Map<string, number>();
const CODEX_OUTPUT_THROTTLE_MS = 200;

/**
 * Codex plan item shape (not yet in SDK types but present in CLI exec JSONL).
 * When the SDK adds a `PlanItem` type this interface can be retired.
 */
interface CodexPlanItem {
  id: string;
  type: "plan";
  plan_markdown?: string;
  text?: string;
}

/**
 * Extract plan text from a `<proposed_plan>` block if the agent wrapped its
 * output in Codex plan-mode tags.  Returns `null` when no block is found.
 */
export function extractProposedPlan(text: string): string | null {
  const openTag = "<proposed_plan>";
  const closeTag = "</proposed_plan>";
  const openIdx = text.indexOf(openTag);
  if (openIdx === -1) return null;
  const contentStart = openIdx + openTag.length;
  const closeIdx = text.indexOf(closeTag, contentStart);
  if (closeIdx === -1) return null;
  return text.slice(contentStart, closeIdx).trim();
}

export function looksLikeCodexPlanText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (extractProposedPlan(trimmed)) {
    return true;
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (nonEmptyLines.length >= 2) {
    return true;
  }

  return nonEmptyLines.some(
    (line) =>
      /^#{1,6}\s/u.test(line) ||
      /^[-*+]\s/u.test(line) ||
      /^\d+\.\s/u.test(line) ||
      /^\[[ xX]\]\s/u.test(line),
  );
}

export function shouldBufferCompletedCodexPlanCandidate(args: {
  planMode: boolean;
  lifecycle: "item.started" | "item.updated" | "item.completed";
  itemType: string;
  text?: string | null;
}) {
  return (
    args.planMode &&
    args.lifecycle === "item.completed" &&
    args.itemType === "agent_message" &&
    Boolean(args.text?.trim())
  );
}

function buildCodexTodoToolInput(args: {
  items: Array<{ text?: string; completed?: boolean }>;
}) {
  return JSON.stringify({
    todos: args.items.map((item) => ({
      content: item.text ?? "",
      status: item.completed ? "completed" : "pending",
    })),
  });
}

export function buildCodexTodoPlanText(args: {
  items: Array<{ text?: string; completed?: boolean }>;
}): string | null {
  const lines = args.items
    .map((item) => {
      const text = item.text?.trim() ?? "";
      if (!text) {
        return null;
      }
      return `- [${item.completed ? "x" : " "}] ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return `## Draft Plan\n${lines.join("\n")}`;
}

export function resolveCodexPlanReadyText(args: {
  finalPlanText?: string | null;
  pendingMessageText?: string | null;
  latestTodoPlanText?: string | null;
}): string | null {
  const todoPlanText = args.latestTodoPlanText?.trim() ?? "";
  const finalPlanText = args.finalPlanText?.trim() ?? "";
  if (finalPlanText) {
    const extracted = extractProposedPlan(finalPlanText);
    if (extracted) {
      return extracted;
    }
    if (!todoPlanText || looksLikeCodexPlanText(finalPlanText)) {
      return finalPlanText;
    }
  }

  const pendingText = args.pendingMessageText?.trim() ?? "";
  if (pendingText) {
    const extracted = extractProposedPlan(pendingText);
    if (extracted) {
      return extracted;
    }
    if (!todoPlanText || looksLikeCodexPlanText(pendingText)) {
      return pendingText;
    }
  }

  return todoPlanText || null;
}

export function mapCodexItemEvent(args: {
  lifecycle: "item.started" | "item.updated" | "item.completed";
  item: ThreadItem | CodexPlanItem;
}): BridgeEvent[] {
  const { item, lifecycle } = args;
  const itemId = (item as { id?: string }).id ?? "";

  switch (item.type) {
    // ── Structured plan item (Codex CLI exec JSONL, not yet in SDK types) ──
    case "plan": {
      const planItem = item as CodexPlanItem;
      const planText = (planItem.plan_markdown ?? planItem.text ?? "").trim();
      if (lifecycle === "item.completed") {
        codexItemTextLength.delete(itemId);
        return planText
          ? [
              {
                type: "plan_ready",
                planText,
                ...(itemId ? { sourceSegmentId: itemId } : {}),
              },
            ]
          : [];
      }
      // For started/updated, stream the plan text as regular text so the
      // user can see progress while the plan is being generated.
      if (!planText) return [];
      const prev = codexItemTextLength.get(itemId) ?? 0;
      const delta = planText.slice(prev);
      if (!delta) return [];
      codexItemTextLength.set(itemId, planText.length);
      return [{ type: "text", text: delta, segmentId: itemId || undefined }];
    }

    case "agent_message": {
      if (lifecycle === "item.completed") {
        const prev = codexItemTextLength.get(itemId) ?? 0;
        codexItemTextLength.delete(itemId);
        const full = item.text ?? "";

        // Detect <proposed_plan> block from plan-mode collaboration output.
        // When the model wraps its response in plan tags the CLI may still
        // emit it as a plain agent_message (especially in exec mode where
        // the structured plan item isn't surfaced yet).
        const proposedPlan = extractProposedPlan(full);
        if (proposedPlan) {
          // Emit trailing text delta first so the streaming view is complete,
          // then emit plan_ready so the plan viewer picks it up.
          const delta = full.slice(prev);
          const events: BridgeEvent[] = [];
          if (delta)
            events.push({
              type: "text",
              text: delta,
              segmentId: itemId || undefined,
            });
          events.push({ type: "plan_ready", planText: proposedPlan });
          return events;
        }

        const delta = full.slice(prev);
        return delta
          ? [{ type: "text", text: delta, segmentId: itemId || undefined }]
          : [];
      }
      // item.started / item.updated — emit delta for streaming.
      const full = item.text ?? "";
      if (!full) {
        return [];
      }
      const prev = codexItemTextLength.get(itemId) ?? 0;
      const delta = full.slice(prev);
      if (!delta) return [];
      codexItemTextLength.set(itemId, full.length);
      return [{ type: "text", text: delta, segmentId: itemId || undefined }];
    }
    case "reasoning": {
      if (lifecycle === "item.completed") {
        const prev = codexItemTextLength.get(itemId) ?? 0;
        codexItemTextLength.delete(itemId);
        const full = item.text ?? "";
        const delta = full.slice(prev);
        return [{ type: "thinking", text: delta, isStreaming: false }];
      }
      // item.started / item.updated — emit delta for streaming
      const full = item.text ?? "";
      if (!full) return [];
      const prev = codexItemTextLength.get(itemId) ?? 0;
      const delta = full.slice(prev);
      if (!delta) return [];
      codexItemTextLength.set(itemId, full.length);
      return [{ type: "thinking", text: delta, isStreaming: true }];
    }
    case "command_execution": {
      const events: BridgeEvent[] = [];
      if (lifecycle === "item.started" && item.command) {
        events.push({
          type: "tool",
          ...(itemId ? { toolUseId: itemId } : {}),
          toolName: "bash",
          input: item.command,
          state: "input-available",
        });
      }
      if (
        lifecycle === "item.updated" &&
        itemId &&
        typeof item.aggregated_output === "string" &&
        item.aggregated_output.length > 0
      ) {
        const now = Date.now();
        const lastEmitAt = codexItemLastEmitTime.get(itemId) ?? 0;
        if (now - lastEmitAt >= CODEX_OUTPUT_THROTTLE_MS) {
          codexItemLastEmitTime.set(itemId, now);
          events.push({
            type: "tool_result",
            tool_use_id: itemId,
            output: item.aggregated_output,
            isPartial: true,
          });
        }
      }
      if (
        lifecycle === "item.completed" &&
        (item.status === "completed" || item.status === "failed")
      ) {
        codexItemLastEmitTime.delete(itemId);
        if (itemId) {
          events.push({
            type: "tool_result",
            tool_use_id: itemId,
            output: item.aggregated_output ?? "",
            ...(item.status === "failed" ? { isError: true } : {}),
          });
        } else {
          events.push({
            type: "tool",
            toolName: "bash",
            input: item.command ?? "",
            output: item.aggregated_output ?? "",
            state:
              item.status === "failed" ? "output-error" : "output-available",
          });
        }
      }
      return events;
    }
    case "mcp_tool_call": {
      const toolLabel = `${item.server ?? "mcp"}:${item.tool ?? "tool"}`;
      const events: BridgeEvent[] = [];
      if (lifecycle === "item.started") {
        events.push({
          type: "tool",
          ...(itemId ? { toolUseId: itemId } : {}),
          toolName: toolLabel,
          input: toText(item.arguments ?? {}),
          state: "input-available",
        });
      }
      if (
        lifecycle === "item.completed" &&
        (item.status === "completed" || item.status === "failed")
      ) {
        const isFailed = item.status === "failed";
        const output = item.error?.message
          ? `[error] ${item.error.message}`
          : toText(item.result ?? "");
        if (itemId) {
          events.push({
            type: "tool_result",
            tool_use_id: itemId,
            output,
            ...(isFailed ? { isError: true } : {}),
          });
        } else {
          events.push({
            type: "tool",
            toolName: toolLabel,
            input: toText(item.arguments ?? {}),
            output,
            state: isFailed ? "output-error" : "output-available",
          });
        }
      }
      return events;
    }
    case "web_search": {
      if (lifecycle === "item.started") {
        return [
          {
            type: "tool",
            ...(itemId ? { toolUseId: itemId } : {}),
            toolName: "web_search",
            input: item.query ?? "",
            state: "input-available",
          },
        ];
      }
      if (lifecycle === "item.completed") {
        if (itemId) {
          return [{ type: "tool_result", tool_use_id: itemId, output: "" }];
        }
        return [
          {
            type: "tool",
            toolName: "web_search",
            input: item.query ?? "",
            output: "",
            state: "output-available",
          },
        ];
      }
      return [];
    }
    case "file_change": {
      if (lifecycle !== "item.completed") return [];
      if (item.status === "failed") {
        return [
          {
            type: "error",
            message: `File change failed: ${(item.changes ?? [])
              .map((c) => c.path ?? "")
              .filter(Boolean)
              .join(", ")}`,
            recoverable: false,
          },
        ];
      }
      return [];
    }
    case "todo_list": {
      const input = buildCodexTodoToolInput({ items: item.items ?? [] });
      return [
        {
          type: "tool",
          ...(itemId ? { toolUseId: itemId } : {}),
          toolName: "TodoWrite",
          input,
          ...(lifecycle === "item.completed"
            ? { state: "output-available" as const }
            : { state: "input-streaming" as const }),
        },
      ];
    }
    case "error":
      return [
        {
          type: "error",
          message: item.message ?? "Codex item error.",
          recoverable: false,
        },
      ];
    default:
      return [];
  }
}

function ensureThread(args: {
  codex: InstanceType<typeof import("@openai/codex-sdk").Codex>;
  taskId?: string;
  cwd: string;
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Thread {
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
  const approvalPolicy = resolveApprovalPolicy({
    runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
    envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
    planMode: planModeEnabled,
    fallback: "untrusted",
  });
  const threadKey = buildThreadKey({
    taskId: args.taskId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
  });
  const existing = threadByTask.get(threadKey);
  if (existing) {
    threadLastUsedAt.set(threadKey, Date.now());
    return existing;
  }

  // LRU eviction: if cache is at capacity, remove the least-recently-used entry.
  if (threadByTask.size >= MAX_CACHED_THREADS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, usedAt] of threadLastUsedAt) {
      if (usedAt < oldestTime) {
        oldestTime = usedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      threadByTask.delete(oldestKey);
      threadIdByTask.delete(oldestKey);
      threadLastUsedAt.delete(oldestKey);
    }
  }
  const resumeThreadId = resolveThreadId({
    threadKey,
    fallbackThreadId: resolveCodexResumeThreadFallback({
      conversation: args.conversation,
      runtimeOptions: args.runtimeOptions,
    }),
  });
  const additionalDirectories = resolveCodexAdditionalDirectories({
    cwd: args.cwd,
  });
  const threadOptions = {
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    workingDirectory: args.cwd,
    ...(additionalDirectories.length > 0 ? { additionalDirectories } : {}),
    sandboxMode: fileAccessMode,
    networkAccessEnabled,
    ...(args.runtimeOptions?.codexReasoningEffort
      ? { modelReasoningEffort: args.runtimeOptions.codexReasoningEffort }
      : {}),
    ...(args.runtimeOptions?.codexWebSearch
      ? { webSearchMode: args.runtimeOptions.codexWebSearch }
      : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
  };
  const thread = resumeThreadId
    ? args.codex.resumeThread(resumeThreadId, threadOptions)
    : args.codex.startThread(threadOptions);
  rememberThreadId({ threadKey, threadId: resumeThreadId });
  threadByTask.set(threadKey, thread);
  threadLastUsedAt.set(threadKey, Date.now());
  return thread;
}

export function cleanupCodexTask(taskId: string) {
  const keyPrefix = `${taskId}:`;
  for (const threadKey of threadByTask.keys()) {
    if (threadKey.startsWith(keyPrefix)) {
      threadByTask.delete(threadKey);
      threadLastUsedAt.delete(threadKey);
    }
  }
  for (const threadKey of threadIdByTask.keys()) {
    if (threadKey.startsWith(keyPrefix)) {
      threadIdByTask.delete(threadKey);
    }
  }
}

export async function streamCodexWithSdk(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
  },
): Promise<BridgeEvent[] | null> {
  let diagnostics: ReturnType<typeof buildCodexDiagnostics> | null = null;
  try {
    const runtimeCwd =
      args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@openai/codex-sdk");
    const CodexCtor = mod.Codex as
      | typeof import("@openai/codex-sdk").Codex
      | undefined;
    if (!CodexCtor) {
      const unavailableEvents: BridgeEvent[] = [
        {
          type: "error",
          message:
            "Codex runtime failure: Codex class is unavailable from SDK import.",
          recoverable: false,
        },
        { type: "done" },
      ];
      unavailableEvents.forEach((event) => args.onEvent?.(event));
      return unavailableEvents;
    }

    const codexExecutablePath = resolveCodexExecutablePath({
      explicitPath: args.runtimeOptions?.codexBinaryPath,
    });
    diagnostics = buildCodexDiagnostics({
      executablePath: codexExecutablePath ?? "",
      taskId: args.taskId,
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

    const codexConfig = buildCodexConfigOverrides({
      runtimeOptions: args.runtimeOptions,
    });
    const codex = new CodexCtor({
      codexBinaryPath: codexExecutablePath,
      env: buildCodexEnv({ executablePath: codexExecutablePath }),
      ...(codexConfig ? { config: codexConfig } : {}),
    });
    const threadKey = buildThreadKey({
      taskId: args.taskId,
      cwd: runtimeCwd,
      runtimeOptions: args.runtimeOptions,
    });
    const thread = ensureThread({
      codex,
      taskId: args.taskId,
      cwd: runtimeCwd,
      conversation: args.conversation,
      runtimeOptions: args.runtimeOptions,
    });
    const abortController = new AbortController();
    args.registerAbort?.(() => abortController.abort());
    const turnOptions: TurnOptions = { signal: abortController.signal };
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

    const streamed = await thread.runStreamed(providerPrompt, turnOptions);

    const codexDebug =
      args.runtimeOptions?.debug ?? process.env.STAVE_CODEX_DEBUG === "1";
    const codexPlanMode = args.runtimeOptions?.codexPlanMode === true;
    const eventCollector = createBoundedBridgeEventCollector({
      maxBytes: CODEX_EVENT_RETAINED_BYTES_MAX,
      reserveTailBytes: CODEX_OVERFLOW_TAIL_BYTES,
    });
    const events = eventCollector.events;
    let sawExperimentalPlanTodo = false;
    let latestTodoPlanText: string | null = null;
    let retainedFinalPlanText: string | null = null;
    let pendingPlanMessageText: string | null = null;
    let hasEmittedPlanReady = false;
    let hasEmittedDone = false;
    const emitBridgeEvent = (event: BridgeEvent) => {
      if (event.type === "plan_ready") {
        hasEmittedPlanReady = true;
      }
      if (event.type === "done") {
        hasEmittedDone = true;
      }
      eventCollector.append(event);
      args.onEvent?.(event);
    };
    const emitBridgeEvents = (nextEvents: BridgeEvent[]) => {
      nextEvents.forEach(emitBridgeEvent);
    };
    const flushPendingPlanMessage = (asPlanReady: boolean) => {
      const planText = resolveCodexPlanReadyText({
        finalPlanText: retainedFinalPlanText,
        pendingMessageText: pendingPlanMessageText,
        latestTodoPlanText,
      });
      const rawText = pendingPlanMessageText?.trim() ?? "";
      pendingPlanMessageText = null;

      if (asPlanReady) {
        if (planText) {
          emitBridgeEvent({ type: "plan_ready", planText });
        }
        return;
      }

      // Even on an early flush (intermediate event arrived before
      // turn.completed), if the buffered text contains <proposed_plan>
      // tags we must emit plan_ready so the plan viewer gets the correct
      // content and the chat body isn't garbled with raw XML tags.
      const extractedPlan = rawText ? extractProposedPlan(rawText) : null;
      if (extractedPlan) {
        emitBridgeEvent({ type: "plan_ready", planText: extractedPlan });
        return;
      }

      if (rawText) {
        emitBridgeEvent({ type: "text", text: rawText });
      }
    };
    // Clear any stale delta-tracking state from a previous aborted turn.
    codexItemTextLength.clear();
    codexItemLastEmitTime.clear();
    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
    for await (const event of streamed.events) {
      const threadEvent = event as ThreadEvent;
      if (codexDebug) {
        console.debug(
          "[codex-sdk-runtime] event",
          threadEvent.type,
          threadEvent,
        );
      }
      if (
        codexPlanMode &&
        pendingPlanMessageText &&
        !(
          threadEvent.type === "item.completed" &&
          threadEvent.item.type === "agent_message"
        ) &&
        threadEvent.type !== "turn.completed"
      ) {
        flushPendingPlanMessage(false);
      }
      switch (threadEvent.type) {
        case "turn.started":
          codexItemTextLength.clear();
          codexItemLastEmitTime.clear();
          sawExperimentalPlanTodo = false;
          latestTodoPlanText = null;
          retainedFinalPlanText = null;
          pendingPlanMessageText = null;
          hasEmittedPlanReady = false;
          break;
        case "item.started":
        case "item.updated":
        case "item.completed": {
          if (codexPlanMode && threadEvent.item.type === "todo_list") {
            sawExperimentalPlanTodo = true;
            latestTodoPlanText = buildCodexTodoPlanText({
              items: threadEvent.item.items ?? [],
            });
          }
          if (
            shouldBufferCompletedCodexPlanCandidate({
              planMode: codexPlanMode,
              lifecycle: threadEvent.type,
              itemType: threadEvent.item.type,
              text:
                threadEvent.item.type === "agent_message"
                  ? threadEvent.item.text
                  : null,
            })
          ) {
            if (pendingPlanMessageText) {
              flushPendingPlanMessage(false);
            }
            pendingPlanMessageText = threadEvent.item.text ?? "";
            if (
              !sawExperimentalPlanTodo ||
              looksLikeCodexPlanText(threadEvent.item.text ?? "")
            ) {
              retainedFinalPlanText = threadEvent.item.text ?? "";
            }
            if (codexDebug) {
              console.debug(
                "[codex-sdk-runtime] buffering final codex plan candidate",
              );
            }
            break;
          }
          const mapped = mapCodexItemEvent({
            lifecycle: threadEvent.type,
            item: threadEvent.item,
          });
          if (
            threadEvent.type === "item.completed" &&
            threadEvent.item.type === "file_change" &&
            threadEvent.item.status === "completed"
          ) {
            const changedPaths = (threadEvent.item.changes ?? [])
              .map((change) => change.path ?? "")
              .filter(Boolean);
            const { diffEvents, unresolvedPaths } =
              await diffTracker.buildDiffEvents({ changedPaths });
            const fallbackEvents = diffTracker.buildFallbackEvents({
              appliedPaths: diffEvents.length === 0 ? changedPaths : [],
              skippedPaths: unresolvedPaths,
            });
            mapped.push(...diffEvents, ...fallbackEvents);
          }
          if (codexDebug) {
            console.debug(
              "[codex-sdk-runtime] item",
              threadEvent.type,
              threadEvent.item.type,
              "→",
              mapped.map((e) => e.type),
            );
          }
          emitBridgeEvents(mapped);
          break;
        }
        case "turn.failed":
          if (pendingPlanMessageText) {
            flushPendingPlanMessage(false);
          }
          emitBridgeEvent({
            type: "error",
            message: toCodexUserFacingErrorMessage({
              message: threadEvent.error?.message ?? "Codex turn failed.",
            }),
            recoverable: true,
          });
          emitBridgeEvent({ type: "done" });
          break;
        case "error":
          if (pendingPlanMessageText) {
            flushPendingPlanMessage(false);
          }
          emitBridgeEvent({
            type: "error",
            message: toCodexUserFacingErrorMessage({
              message: threadEvent.message,
            }),
            recoverable: true,
          });
          break;
        case "turn.completed":
          if (
            !hasEmittedPlanReady &&
            codexPlanMode &&
            (retainedFinalPlanText ||
              pendingPlanMessageText ||
              latestTodoPlanText)
          ) {
            flushPendingPlanMessage(true);
          }
          {
            const completedEvent = threadEvent as TurnCompletedEvent;
            emitBridgeEvent({
              type: "usage",
              inputTokens: completedEvent.usage.input_tokens,
              outputTokens: completedEvent.usage.output_tokens,
              ...(completedEvent.usage.cached_input_tokens > 0
                ? { cacheReadTokens: completedEvent.usage.cached_input_tokens }
                : {}),
            });
          }
          emitBridgeEvent({ type: "done" });
          break;
        case "thread.started":
          rememberThreadId({
            threadKey,
            threadId: threadEvent.thread_id,
          });
          emitBridgeEvents(
            buildCodexThreadStartedEvents({
              threadId: threadEvent.thread_id,
            }),
          );
          break;
        default:
          if (codexDebug) {
            console.debug(
              "[codex-sdk-runtime] unhandled event type",
              threadEvent.type,
            );
          }
          break;
      }
    }

    if (events.length === 0 && eventCollector.overflowed) {
      for (const overflowEvent of CODEX_OVERFLOW_TAIL_EVENTS) {
        eventCollector.appendTail(overflowEvent);
      }
      return events;
    }

    if (events.length === 0) {
      const emptyEvents: BridgeEvent[] = [
        { type: "text", text: "No events returned from Codex SDK." },
        { type: "done" },
      ];
      emptyEvents.forEach((event) => args.onEvent?.(event));
      return emptyEvents;
    }

    if (eventCollector.overflowed) {
      for (const overflowEvent of CODEX_OVERFLOW_TAIL_EVENTS) {
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
  } catch (error) {
    // Distinguish abort (user-initiated cancel) from real failures.
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      (error instanceof Error && /aborted|cancel/i.test(error.message));
    if (isAbort) {
      console.info("[provider-runtime] Codex turn aborted", {
        taskId: args.taskId,
      });
      const abortEvents: BridgeEvent[] = [
        { type: "done", stop_reason: "user_abort" },
      ];
      abortEvents.forEach((event) => args.onEvent?.(event));
      return abortEvents;
    }
    // Evict the cached thread so a subsequent retry does not attempt to
    // resume the same (possibly stale) thread that just failed.
    if (args.taskId) {
      cleanupCodexTask(args.taskId);
    }
    console.warn(
      "[provider-runtime] Codex SDK unavailable",
      error,
      diagnostics,
    );
    const reason = toCodexUserFacingErrorMessage({ message: toText(error) });
    const failureEvents: BridgeEvent[] = [
      {
        type: "error",
        message: `Codex runtime failure: ${reason} | diagnostics=${toText(diagnostics)}`,
        recoverable: true,
      },
      { type: "done" },
    ];
    failureEvents.forEach((event) => args.onEvent?.(event));
    return failureEvents;
  }
}
