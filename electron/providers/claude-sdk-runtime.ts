import type { BridgeEvent, StreamTurnArgs } from "./types";
import { buildProviderTurnPrompt, resolveProviderResumeConversationId } from "../../src/lib/providers/provider-request-translators";
import type {
  Query,
  SDKMessage,
  SDKAssistantMessage,
  SDKSystemMessage,
  SDKResultMessage,
  SlashCommand,
} from "@anthropic-ai/claude-agent-sdk";
import { toText } from "./utils";
import { createTurnDiffTracker } from "./turn-diff-tracker";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";

type ClaudePermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";

const ClaudePermissionResultSchema = z.union([
  z.object({
    behavior: z.literal("allow"),
    updatedInput: z.record(z.string(), z.unknown()),
    updatedPermissions: z.array(z.unknown()).optional(),
  }),
  z.object({
    behavior: z.literal("deny"),
    message: z.string(),
    interrupt: z.boolean().optional(),
  }),
]);

type ClaudePermissionResult = z.infer<typeof ClaudePermissionResultSchema>;

function parseBooleanEnv(args: { value: string | undefined; fallback: boolean }) {
  const normalized = args.value?.trim().toLowerCase();
  if (!normalized) {
    return args.fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return args.fallback;
}

function resolveClaudePermissionMode(args: {
  runtimeValue?: ClaudePermissionMode;
  envValue?: string;
  fallback: ClaudePermissionMode;
}): ClaudePermissionMode {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate === "default"
    || candidate === "acceptEdits"
    || candidate === "bypassPermissions"
    || candidate === "plan"
    || candidate === "dontAsk"
  ) {
    return candidate;
  }
  return args.fallback;
}

function canExecute(args: { path: string }) {
  try {
    accessSync(args.path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function parseClaudeVersion(args: { value: string }) {
  const match = args.value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersion(a: { major: number; minor: number; patch: number }, b: { major: number; minor: number; patch: number }) {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

function probeClaudeExecutable(args: { path: string }) {
  const result = spawnSync(args.path, ["--version"], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    return null;
  }
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const version = parseClaudeVersion({ value: text });
  return {
    path: args.path,
    version,
    raw: text,
  };
}

function resolveClaudeExecutablePath() {
  const candidates = [
    process.env.STAVE_CLAUDE_CLI_PATH,
    process.env.CLAUDE_CODE_PATH,
    `${homedir()}/.claude/local/claude`,
    `${homedir()}/.bun/bin/claude`,
    `${homedir()}/.local/bin/claude`,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const available = candidates
    .filter((candidate) => canExecute({ path: candidate }))
    .map((candidate) => probeClaudeExecutable({ path: candidate }))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (available.length === 0) {
    return "";
  }

  available.sort((left, right) => {
    if (left.version && right.version) {
      return compareVersion(right.version, left.version);
    }
    if (left.version) {
      return -1;
    }
    if (right.version) {
      return 1;
    }
    return 0;
  });

  return available[0]?.path ?? "";
}

function buildClaudeEnv(args: { executablePath: string }) {
  const env = { ...process.env } as Record<string, string | undefined>;
  // Prevent Electron parent-process env from breaking spawned CLI behavior.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  delete env.ELECTRON_NO_ASAR;
  delete env.ELECTRON_ENABLE_LOGGING;
  delete env.ELECTRON_ENABLE_STACK_DUMPING;
  delete env.ELECTRON_DISABLE_SECURITY_WARNINGS;

  const currentPath = process.env.PATH ?? "";
  const prepends = new Set<string>([
    `${homedir()}/.claude/local`,
    `${homedir()}/.bun/bin`,
    `${homedir()}/.local/bin`,
    args.executablePath ? path.dirname(args.executablePath) : "",
  ]);
  const mergedPath = [...prepends].filter(Boolean).join(":");
  const finalPath = mergedPath.length > 0
    ? `${mergedPath}${currentPath ? `:${currentPath}` : ""}`
    : currentPath;

  env.CLAUDECODE = undefined;
  env.PATH = finalPath;
  return env;
}

function summarizePath(args: { value: string | undefined }) {
  return (args.value ?? "")
    .split(":")
    .filter(Boolean)
    .slice(0, 8)
    .join(":");
}

function buildClaudeDiagnostics(args: {
  executablePath: string;
  taskId?: string;
  cwd: string;
}) {
  const env = buildClaudeEnv({ executablePath: args.executablePath });
  const versionProbe = args.executablePath
    ? spawnSync(args.executablePath, ["--version"], {
      encoding: "utf8",
      env,
    })
    : null;

  return {
    taskId: args.taskId ?? "default",
    cwd: args.cwd,
    executablePath: args.executablePath || "<sdk-default>",
    executableExists: args.executablePath ? canExecute({ path: args.executablePath }) : null,
    envPathHead: summarizePath({ value: env.PATH }),
    electronEnv: {
      ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE ?? "",
      ELECTRON_NO_ATTACH_CONSOLE: process.env.ELECTRON_NO_ATTACH_CONSOLE ?? "",
      ELECTRON_NO_ASAR: process.env.ELECTRON_NO_ASAR ?? "",
    },
    versionProbe: versionProbe
      ? {
        status: versionProbe.status,
        signal: versionProbe.signal,
        error: versionProbe.error ? String(versionProbe.error) : "",
        stdout: (versionProbe.stdout ?? "").trim(),
        stderr: (versionProbe.stderr ?? "").trim(),
      }
      : null,
  };
}

function normalizeClaudeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function validateClaudePermissionResult(args: {
  candidate: ClaudePermissionResult;
  fallbackMessage: string;
  context: string;
}): ClaudePermissionResult {
  const parsed = ClaudePermissionResultSchema.safeParse(args.candidate);
  if (parsed.success) {
    return parsed.data;
  }
  console.warn("[claude-sdk-runtime] invalid permission callback result; falling back to deny", {
    context: args.context,
    error: parsed.error.flatten(),
  });
  return {
    behavior: "deny",
    message: args.fallbackMessage,
  };
}

function buildClaudeDenyPermissionResult(args: {
  message: string;
  context: string;
  interrupt?: boolean;
}): ClaudePermissionResult {
  return validateClaudePermissionResult({
    candidate: {
      behavior: "deny",
      message: args.message,
      ...(typeof args.interrupt === "boolean" ? { interrupt: args.interrupt } : {}),
    },
    fallbackMessage: args.message,
    context: args.context,
  });
}

export function buildClaudeSystemPrompt(args: {
  cwd: string;
  baseSystemPrompt?: string;
}) {
  const workspacePrompt = [
    "Stave workspace context:",
    `Current workspace root: ${args.cwd}`,
    "Resolve every relative filesystem path against the workspace root above.",
    "Do not rewrite a user-provided relative path like ./docs into a sibling directory outside that workspace root.",
    "If the user explicitly asks to access a path outside the workspace root, keep the exact requested path and request approval instead of guessing a nearby absolute path.",
  ].join("\n");

  const baseSystemPrompt = args.baseSystemPrompt?.trim();
  if (!baseSystemPrompt) {
    return workspacePrompt;
  }

  return `${baseSystemPrompt}\n\n${workspacePrompt}`;
}

function extractClaudeTerminalIssue(args: { stdoutTail: string }) {
  const source = args.stdoutTail;
  if (source.includes("\"error\":\"rate_limit\"") || source.includes("\"rate_limit_event\"")) {
    const quoted = source.match(/"You've hit your limit[^"]*"/);
    if (quoted?.[0]) {
      return quoted[0].slice(1, -1);
    }
    return null;
  }
  if (source.includes("\"error\":\"authentication_failed\"")) {
    return "Claude authentication failed. Run `claude auth login` and retry.";
  }
  if (source.includes("\"error\":\"billing_error\"")) {
    return "Claude billing/subscription issue detected. Check plan/payment status and retry.";
  }
  return null;
}

function summarizeClaudePermissionRequest(args: {
  toolName: string;
  input: Record<string, unknown>;
  decisionReason?: string;
  blockedPath?: string;
}) {
  const details: string[] = [];
  if (args.decisionReason?.trim()) {
    details.push(args.decisionReason.trim());
  }
  if (args.blockedPath?.trim()) {
    details.push(`Blocked path: ${args.blockedPath.trim()}`);
  }
  const renderedInput = toText(args.input ?? {}).trim();
  if (renderedInput) {
    details.push(`Input: ${renderedInput}`);
  }
  return details.length > 0
    ? details.join("\n")
    : `Claude requested permission to run ${args.toolName}.`;
}

function parseClaudeQuestionList(args: { input: Record<string, unknown> }) {
  const rawQuestions = args.input.questions;
  if (!Array.isArray(rawQuestions)) {
    return [];
  }
  return rawQuestions.flatMap((rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return [];
    }
    const candidate = rawQuestion as Record<string, unknown>;
    const question = typeof candidate.question === "string" ? candidate.question : "";
    const header = typeof candidate.header === "string" ? candidate.header : "";
    const options = Array.isArray(candidate.options)
      ? candidate.options.flatMap((rawOption) => {
        if (!rawOption || typeof rawOption !== "object") {
          return [];
        }
        const option = rawOption as Record<string, unknown>;
        if (typeof option.label !== "string" || typeof option.description !== "string") {
          return [];
        }
        return [{
          label: option.label,
          description: option.description,
        }];
      })
      : [];
    if (!question || !header || options.length === 0) {
      return [];
    }
    return [{
      question,
      header,
      options,
      ...(typeof candidate.multiSelect === "boolean" ? { multiSelect: candidate.multiSelect } : {}),
    }];
  });
}

function waitForClaudeToolDecision<T>(args: {
  signal: AbortSignal;
  register: (resolve: (value: T) => void) => () => void;
}) {
  return new Promise<T>((resolve, reject) => {
    if (args.signal.aborted) {
      reject(new Error("Claude tool permission request aborted."));
      return;
    }
    const cleanup = args.register((value) => {
      args.signal.removeEventListener("abort", handleAbort);
      resolve(value);
    });
    const handleAbort = () => {
      cleanup();
      reject(new Error("Claude tool permission request aborted."));
    };
    args.signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function buildClaudeApprovalPermissionResult(args: {
  approved: boolean;
  normalizedInput: Record<string, unknown>;
  denialMessage: string;
}): ClaudePermissionResult {
  if (!args.approved) {
    return buildClaudeDenyPermissionResult({
      message: args.denialMessage,
      context: "approval:deny",
    });
  }

  // The installed SDK runtime validates successful permission results more
  // strictly than its published TypeScript surface. Returning the current
  // input avoids a malformed allow response when no input changes are needed.
  return validateClaudePermissionResult({
    candidate: {
      behavior: "allow",
      updatedInput: args.normalizedInput,
    },
    fallbackMessage: args.denialMessage,
    context: "approval:allow",
  });
}

export function buildClaudeUserInputPermissionResult(args: {
  normalizedInput: Record<string, unknown>;
  answers?: Record<string, string>;
  denied?: boolean;
}): ClaudePermissionResult {
  if (args.denied) {
    return buildClaudeDenyPermissionResult({
      message: "User declined to answer questions.",
      context: "user-input:deny",
    });
  }

  return validateClaudePermissionResult({
    candidate: {
      behavior: "allow",
      updatedInput: {
        ...args.normalizedInput,
        answers: args.answers ?? {},
      },
    },
    fallbackMessage: "User declined to answer questions.",
    context: "user-input:allow",
  });
}

function toClaudeThinkingConfig(thinkingMode?: "adaptive" | "enabled" | "disabled") {
  if (thinkingMode === "adaptive") {
    return { type: "adaptive" as const };
  }
  if (thinkingMode === "enabled") {
    return { type: "enabled" as const };
  }
  if (thinkingMode === "disabled") {
    return { type: "disabled" as const };
  }
  return undefined;
}

export function resolveClaudeAgentProgressSummaries(value?: boolean) {
  return typeof value === "boolean" ? value : undefined;
}

function buildClaudeTaskProgressEvents(message: SDKSystemMessage & {
  subtype?: string;
  summary?: string;
}) {
  if (message.subtype !== "task_progress") {
    return [];
  }
  const summary = message.summary?.trim();
  if (!summary) {
    return [];
  }
  return [{
    type: "system" as const,
    content: `Subagent progress: ${summary}`,
  }];
}

function buildClaudeUsageEvent(resultMsg: SDKResultMessage): BridgeEvent {
  return {
    type: "usage",
    inputTokens: resultMsg.usage.input_tokens,
    outputTokens: resultMsg.usage.output_tokens,
    ...(resultMsg.usage.cache_read_input_tokens != null
      ? { cacheReadTokens: resultMsg.usage.cache_read_input_tokens }
      : {}),
    ...(resultMsg.usage.cache_creation_input_tokens != null
      ? { cacheCreationTokens: resultMsg.usage.cache_creation_input_tokens }
      : {}),
    ...(typeof resultMsg.total_cost_usd === "number"
      ? { totalCostUsd: resultMsg.total_cost_usd }
      : {}),
  };
}

function toProviderSlashCommand(command: SlashCommand) {
  return {
    name: command.name,
    command: `/${command.name}`,
    description: command.description,
    ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
  };
}

export function mapClaudeMessageToEvents(args: {
  message: SDKMessage;
  claudeDebugStream: boolean;
}): BridgeEvent[] {
  const { message, claudeDebugStream } = args;

  if (message.type === "system") {
    const sysMsg = message as SDKSystemMessage & { subtype?: string; content?: string; summary?: string };
    if (sysMsg.subtype === "local_command_output" && typeof sysMsg.content === "string" && sysMsg.content.trim()) {
      return [{ type: "text", text: sysMsg.content }];
    }
    if (sysMsg.subtype === "init" && typeof sysMsg.session_id === "string" && sysMsg.session_id.trim()) {
      return [{
        type: "provider_conversation",
        providerId: "claude-code",
        nativeConversationId: sysMsg.session_id,
      }];
    }
    if (sysMsg.subtype === "compact_boundary") {
      const meta = (sysMsg as { compact_metadata?: { trigger?: string } }).compact_metadata;
      const trigger = meta?.trigger ?? "auto";
      return [{ type: "system", content: `Context compacted (${trigger}).` }];
    }
    if (sysMsg.subtype === "status") {
      const status = (sysMsg as { status?: string | null }).status;
      if (status === "compacting") {
        return [{ type: "system", content: "Compacting conversation context\u2026" }];
      }
      return [];
    }
    const taskProgressEvents = buildClaudeTaskProgressEvents(sysMsg);
    if (taskProgressEvents.length > 0) {
      return taskProgressEvents;
    }
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] system init", sysMsg.subtype, sysMsg.session_id);
    }
    return [];
  }

  if (message.type === "assistant") {
    const assistantMsg = message as SDKAssistantMessage;

    if (assistantMsg.error) {
      if (assistantMsg.error === "authentication_failed") {
        return [{ type: "text", text: "Claude authentication failed. Run `claude auth login` and retry." }];
      }
      if (assistantMsg.error === "billing_error") {
        return [{ type: "text", text: "Claude billing/subscription issue detected. Check plan/payment status and retry." }];
      }
    }

    // content is on the nested BetaMessage, not at the top level
    const contentBlocks = assistantMsg.message?.content;
    if (!Array.isArray(contentBlocks)) {
      return [];
    }

    const events: BridgeEvent[] = [];
    for (const block of contentBlocks) {
      const b = block as {
        type?: string;
        text?: string;
        thinking?: string;
        name?: string;
        input?: unknown;
      };
      if (b.type === "text" && b.text) {
        events.push({ type: "text", text: b.text });
        continue;
      }
      if (b.type === "thinking" && b.thinking) {
        events.push({ type: "thinking", text: b.thinking });
        continue;
      }
      if (b.type === "redacted_thinking") {
        // skip — redacted thinking is not surfaced to the user
        continue;
      }
      if (b.type === "tool_use") {
        if (b.name === "ExitPlanMode") {
          const planText = typeof (b.input as Record<string, unknown>)?.plan === "string"
            ? (b.input as Record<string, unknown>).plan as string
            : "";
          events.push({ type: "plan_ready", planText });
          continue;
        }
        const toolUseId = typeof (b as { id?: string }).id === "string"
          ? (b as { id: string }).id
          : undefined;
        events.push({
          type: "tool",
          ...(toolUseId ? { toolUseId } : {}),
          toolName: b.name ?? "tool_use",
          input: toText(b.input ?? {}),
          state: "input-available",
        });
        continue;
      }
    }
    return events;
  }

  if (message.type === "stream_event") {
    // SDKPartialAssistantMessage — streaming content deltas
    const streamMsg = message as { type: "stream_event"; event: unknown };
    const event = streamMsg.event;
    if (!event || typeof event !== "object") {
      return [];
    }
    const streamEvent = event as {
      type?: string;
      delta?: { type?: string; thinking?: string; text?: string };
      error?: { message?: string };
    };
    if (streamEvent.type === "content_block_delta") {
      if (streamEvent.delta?.type === "thinking_delta" && streamEvent.delta.thinking) {
        return [{ type: "thinking", text: streamEvent.delta.thinking, isStreaming: true }];
      }
      if (streamEvent.delta?.type === "text_delta" && streamEvent.delta.text) {
        return [{ type: "text", text: streamEvent.delta.text }];
      }
      return [];
    }
    if (streamEvent.type === "error") {
      return [{
        type: "error",
        message: `Claude stream error: ${toText(streamEvent.error ?? streamEvent)}`,
        recoverable: false,
      }];
    }
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] stream_event", streamEvent);
    }
    return [];
  }

  if (message.type === "user" || (message as { type: string }).type === "user_message_replay") {
    // Surface tool_result content blocks so the UI can populate subagent output.
    const userMsg = message as { type: string; message?: { content?: unknown } };
    const userContent = userMsg.message?.content;
    if (Array.isArray(userContent)) {
      const toolResultEvents: BridgeEvent[] = [];
      for (const block of userContent) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const b = block as { type?: string; tool_use_id?: string; content?: unknown };
        if (b.type !== "tool_result" || typeof b.tool_use_id !== "string") {
          continue;
        }
        let output = "";
        if (typeof b.content === "string") {
          output = b.content;
        } else if (Array.isArray(b.content)) {
          output = b.content
            .flatMap((c: unknown) => {
              if (!c || typeof c !== "object") {
                return [];
              }
              const cb = c as { type?: string; text?: string };
              return cb.type === "text" && typeof cb.text === "string" ? [cb.text] : [];
            })
            .join("\n");
        }
        toolResultEvents.push({ type: "tool_result", tool_use_id: b.tool_use_id, output });
      }
      return toolResultEvents;
    }
    return [];
  }

  if (message.type === "prompt_suggestion") {
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] prompt_suggestion", message);
    }
    const suggestion = (message as { suggestion?: string }).suggestion?.trim();
    if (!suggestion) {
      return [];
    }
    return [{ type: "prompt_suggestions", suggestions: [suggestion] }];
  }

  if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    const events: BridgeEvent[] = [buildClaudeUsageEvent(resultMsg)];
    if (resultMsg.is_error) {
      const errorText = (resultMsg as { result?: string }).result;
      if (typeof errorText === "string" && errorText.length > 0) {
        events.unshift({ type: "text", text: errorText });
      }
    }
    return events;
  }

  if (message.type === "rate_limit_event") {
    const rlMsg = message as {
      type: "rate_limit_event";
      rate_limit_info?: {
        status?: string;
        resetsAt?: number;
        utilization?: number;
      };
    };
    const info = rlMsg.rate_limit_info;
    if (info?.status === "rejected") {
      const resetTime = info.resetsAt
        ? new Date(info.resetsAt * 1000).toLocaleTimeString()
        : "unknown";
      return [{
        type: "error",
        message: `Rate limit reached. Resets at ${resetTime}.`,
        recoverable: true,
      }];
    }
    if (info?.status === "allowed_warning") {
      const pct = info.utilization != null
        ? ` (${Math.round(info.utilization * 100)}% used)`
        : "";
      return [{
        type: "system",
        content: `Approaching rate limit${pct}. Consider pacing requests.`,
      }];
    }
    return [];
  }

  if (message.type === "tool_progress") {
    const progressMsg = message as {
      type: "tool_progress";
      tool_use_id?: string;
      tool_name?: string;
      elapsed_time_seconds?: number;
    };
    const toolUseId = progressMsg.tool_use_id;
    if (typeof toolUseId === "string" && toolUseId) {
      return [{
        type: "tool_progress",
        toolUseId,
        toolName: progressMsg.tool_name ?? "tool",
        elapsedSeconds: progressMsg.elapsed_time_seconds ?? 0,
      }];
    }
    return [];
  }

  if (message.type === "tool_use_summary") {
    const sumMsg = message as { type: "tool_use_summary"; summary?: string };
    const summary = sumMsg.summary?.trim();
    if (summary) {
      return [{ type: "system", content: summary }];
    }
    return [];
  }

  if (
    message.type === "auth_status"
    || message.type === "task_notification"
    || message.type === "task_started"
    || message.type === "task_progress"
    || message.type === "files_persisted"
    || message.type === "hook_started"
    || message.type === "hook_progress"
    || message.type === "hook_response"
  ) {
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] meta", message.type, message);
    }
    return [];
  }

  if (message.type === "error") {
    return [{ type: "error", message: `Claude error: ${toText(message)}`, recoverable: false }];
  }

  return [];
}

const sessionIdByTask = new Map<string, string>();
const activeRunByTask = new Map<string, Promise<void>>();

export async function getClaudeCommandCatalog(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  let stream: Query | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;

    if (!queryFn) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail: "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();
    const permissionMode = resolveClaudePermissionMode({
      runtimeValue: args.runtimeOptions?.claudePermissionMode,
      envValue: process.env.STAVE_CLAUDE_PERMISSION_MODE?.trim(),
      fallback: "bypassPermissions",
    });
    const allowDangerouslySkipPermissions = args.runtimeOptions?.claudeAllowDangerouslySkipPermissions
      ?? parseBooleanEnv({
        value: process.env.STAVE_CLAUDE_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS,
        fallback: permissionMode === "bypassPermissions",
      });
    const claudeSandboxEnabled = args.runtimeOptions?.claudeSandboxEnabled
      ?? parseBooleanEnv({
        value: process.env.STAVE_CLAUDE_SANDBOX_ENABLED,
        fallback: false,
      });
    const claudeAllowUnsandboxedCommands = args.runtimeOptions?.claudeAllowUnsandboxedCommands
      ?? parseBooleanEnv({
        value: process.env.STAVE_CLAUDE_ALLOW_UNSANDBOXED_COMMANDS,
        fallback: true,
      });
    const thinking = toClaudeThinkingConfig(args.runtimeOptions?.claudeThinkingMode);
    const agentProgressSummaries = resolveClaudeAgentProgressSummaries(args.runtimeOptions?.claudeAgentProgressSummaries);

    stream = queryFn({
      prompt: "",
      options: {
        permissionMode,
        ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions } : {}),
        promptSuggestions: false,
        cwd: runtimeCwd,
        ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
        ...(args.runtimeOptions?.claudeSystemPrompt ? { systemPrompt: args.runtimeOptions.claudeSystemPrompt } : {}),
        ...(args.runtimeOptions?.claudeEffort ? { effort: args.runtimeOptions.claudeEffort } : {}),
        ...(thinking ? { thinking } : {}),
        ...(agentProgressSummaries !== undefined ? { agentProgressSummaries } : {}),
        ...(args.runtimeOptions?.claudeAllowedTools ? { allowedTools: args.runtimeOptions.claudeAllowedTools } : {}),
        ...(args.runtimeOptions?.claudeDisallowedTools ? { disallowedTools: args.runtimeOptions.claudeDisallowedTools } : {}),
        ...(args.runtimeOptions?.claudeFastMode ? { settings: { fastMode: true } } : {}),
        sandbox: {
          enabled: claudeSandboxEnabled,
          allowUnsandboxedCommands: claudeAllowUnsandboxedCommands,
        },
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
        ...(claudeExecutablePath.length > 0 ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
      },
    }) as Query;

    const commands = await stream.supportedCommands();
    return {
      ok: true,
      supported: true,
      commands: commands.map(toProviderSlashCommand),
      detail: commands.length > 0
        ? `Loaded ${commands.length} Claude native command${commands.length === 1 ? "" : "s"} for ${runtimeCwd}.`
        : `Claude reported no native slash commands for ${runtimeCwd}.`,
    };
  } catch (error) {
    return {
      ok: false,
      supported: false,
      commands: [],
      detail: `Claude command catalog unavailable: ${toText(error)}`,
    };
  } finally {
    stream?.close();
  }
}

export function cleanupClaudeTask(taskId: string) {
  sessionIdByTask.delete(taskId);
  activeRunByTask.delete(taskId);
}

function resolveSessionId(args: { taskId?: string; fallbackSessionId?: string }) {
  const taskKey = args.taskId ?? "default";
  return sessionIdByTask.get(taskKey) ?? args.fallbackSessionId?.trim();
}

function rememberSessionId(args: { taskId?: string; sessionId?: string }) {
  const nextSessionId = args.sessionId?.trim();
  if (!nextSessionId) {
    return;
  }
  const taskKey = args.taskId ?? "default";
  sessionIdByTask.set(taskKey, nextSessionId);
}

export async function streamClaudeWithSdk(args: StreamTurnArgs & {
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
  registerApprovalResponder?: (responder: (args: { requestId: string; approved: boolean }) => boolean) => void;
  registerUserInputResponder?: (responder: (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => boolean) => void;
}): Promise<BridgeEvent[] | null> {
  const taskKey = args.taskId ?? "default";
  const previousRun = activeRunByTask.get(taskKey) ?? Promise.resolve();
  let releaseCurrentRun: (() => void) | null = null;
  const currentRun = new Promise<void>((resolve) => {
    releaseCurrentRun = resolve;
  });
  const chainedRun = previousRun.then(() => currentRun);
  activeRunByTask.set(taskKey, chainedRun);
  await previousRun;

  let selectedClaudePath = "";
  let diagnostics: ReturnType<typeof buildClaudeDiagnostics> | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;

    if (!queryFn) {
      return [
        { type: "error", message: "Claude runtime failure: query() is unavailable from SDK import.", recoverable: false },
        { type: "done" },
      ];
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();
    selectedClaudePath = claudeExecutablePath;
    diagnostics = buildClaudeDiagnostics({
      executablePath: claudeExecutablePath,
      taskId: args.taskId,
      cwd: runtimeCwd,
    });
    const events: BridgeEvent[] = [];
    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
    const pendingApprovalResolvers = new Map<string, (approved: boolean) => void>();
    const pendingUserInputResolvers = new Map<string, (response: {
      answers?: Record<string, string>;
      denied?: boolean;
    }) => void>();

    args.registerApprovalResponder?.(({ requestId, approved }) => {
      const resolver = pendingApprovalResolvers.get(requestId);
      if (!resolver) {
        return false;
      }
      pendingApprovalResolvers.delete(requestId);
      resolver(approved);
      return true;
    });
    args.registerUserInputResponder?.(({ requestId, answers, denied }) => {
      const resolver = pendingUserInputResolvers.get(requestId);
      if (!resolver) {
        return false;
      }
      pendingUserInputResolvers.delete(requestId);
      resolver({ answers, denied });
      return true;
    });

    const existingSessionId = resolveSessionId({
      taskId: args.taskId,
      fallbackSessionId: resolveProviderResumeConversationId({
        conversation: args.conversation,
        fallbackResumeId: args.runtimeOptions?.claudeResumeSessionId,
      }),
    });
    const permissionMode = resolveClaudePermissionMode({
      runtimeValue: args.runtimeOptions?.claudePermissionMode,
      envValue: process.env.STAVE_CLAUDE_PERMISSION_MODE?.trim(),
      fallback: "bypassPermissions",
    });
    const allowDangerouslySkipPermissions = args.runtimeOptions?.claudeAllowDangerouslySkipPermissions
      ?? parseBooleanEnv({
        value: process.env.STAVE_CLAUDE_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS,
        fallback: permissionMode === "bypassPermissions",
      });
    const claudeSandboxEnabled = args.runtimeOptions?.claudeSandboxEnabled
      ?? parseBooleanEnv({
        value: process.env.STAVE_CLAUDE_SANDBOX_ENABLED,
        fallback: false,
      });
    const claudeAllowUnsandboxedCommands = args.runtimeOptions?.claudeAllowUnsandboxedCommands
      ?? parseBooleanEnv({
        value: process.env.STAVE_CLAUDE_ALLOW_UNSANDBOXED_COMMANDS,
        fallback: true,
      });
    const thinking = toClaudeThinkingConfig(args.runtimeOptions?.claudeThinkingMode);
    const agentProgressSummaries = resolveClaudeAgentProgressSummaries(args.runtimeOptions?.claudeAgentProgressSummaries);
    const claudeSystemPrompt = buildClaudeSystemPrompt({
      cwd: runtimeCwd,
      baseSystemPrompt: args.runtimeOptions?.claudeSystemPrompt,
    });
    const providerPrompt = buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
    });
    const stream = queryFn({
      prompt: providerPrompt,
      options: {
        permissionMode,
        ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions } : {}),
        ...(existingSessionId ? { resume: existingSessionId } : {}),
        includePartialMessages: true,
        promptSuggestions: true,
        cwd: runtimeCwd,
        ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
        ...(claudeSystemPrompt ? { systemPrompt: claudeSystemPrompt } : {}),
        ...(typeof args.runtimeOptions?.claudeMaxTurns === "number" ? { maxTurns: args.runtimeOptions.claudeMaxTurns } : {}),
        ...(typeof args.runtimeOptions?.claudeMaxBudgetUsd === "number" ? { maxBudgetUsd: args.runtimeOptions.claudeMaxBudgetUsd } : {}),
        ...(args.runtimeOptions?.claudeEffort ? { effort: args.runtimeOptions.claudeEffort } : {}),
        ...(thinking ? { thinking } : {}),
        ...(agentProgressSummaries !== undefined ? { agentProgressSummaries } : {}),
        ...(args.runtimeOptions?.claudeAllowedTools ? { allowedTools: args.runtimeOptions.claudeAllowedTools } : {}),
        ...(args.runtimeOptions?.claudeDisallowedTools ? { disallowedTools: args.runtimeOptions.claudeDisallowedTools } : {}),
        ...(args.runtimeOptions?.claudeFastMode ? { settings: { fastMode: true } } : {}),
        canUseTool: async (toolName, input, options) => {
          const normalizedInput = normalizeClaudeToolInput(input);
          const requestId = options.toolUseID;

          if (toolName === "AskUserQuestion") {
            const questions = parseClaudeQuestionList({ input: normalizedInput });
            if (questions.length === 0) {
              return buildClaudeDenyPermissionResult({
                message: "AskUserQuestion was requested without any valid questions.",
                context: "user-input:invalid-questions",
              });
            }

            const userInputEvent: BridgeEvent = {
              type: "user_input",
              toolName,
              requestId,
              questions,
            };
            events.push(userInputEvent);
            args.onEvent?.(userInputEvent);

            const response = await waitForClaudeToolDecision({
              signal: options.signal,
              register: (resolve) => {
                pendingUserInputResolvers.set(requestId, resolve);
                return () => {
                  pendingUserInputResolvers.delete(requestId);
                };
              },
            });
            return buildClaudeUserInputPermissionResult({
              normalizedInput,
              answers: response.answers,
              denied: response.denied,
            });
          }

          const approvalEvent: BridgeEvent = {
            type: "approval",
            toolName,
            requestId,
            description: summarizeClaudePermissionRequest({
              toolName,
              input: normalizedInput,
              decisionReason: options.decisionReason,
              blockedPath: options.blockedPath,
            }),
          };
          events.push(approvalEvent);
          args.onEvent?.(approvalEvent);

          const approved = await waitForClaudeToolDecision({
            signal: options.signal,
            register: (resolve) => {
              pendingApprovalResolvers.set(requestId, resolve);
              return () => {
                pendingApprovalResolvers.delete(requestId);
              };
            },
          });
          return buildClaudeApprovalPermissionResult({
            approved,
            normalizedInput,
            denialMessage: `User denied permission for ${toolName}.`,
          });
        },
        sandbox: {
          enabled: claudeSandboxEnabled,
          allowUnsandboxedCommands: claudeAllowUnsandboxedCommands,
        },
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
        ...(claudeExecutablePath.length > 0 ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
      },
    }) as Query;

    // Register abort handler using the official Query.close() method
    args.registerAbort?.(() => {
      stream.close();
    });

    let hasStreamedText = false;
    let hasStreamedThinking = false;
    let finalStopReason: string | undefined;
    const claudeDebugStream = args.runtimeOptions?.debug ?? process.env.STAVE_CLAUDE_DEBUG === "1";

    for await (const message of stream) {
      if (message.type === "system" && (message as SDKSystemMessage).subtype === "init") {
        rememberSessionId({ taskId: args.taskId, sessionId: (message as SDKSystemMessage).session_id });
      }
      if (message.type === "system" && (message as SDKSystemMessage).subtype === "files_persisted") {
        const persistedMessage = message as SDKSystemMessage & {
          subtype: "files_persisted";
          files?: Array<{ filename?: string }>;
          failed?: Array<{ filename?: string; error?: string }>;
        };
        const changedPaths = (persistedMessage.files ?? [])
          .map((item) => item.filename ?? "")
          .filter(Boolean);
        const { diffEvents, unresolvedPaths } = await diffTracker.buildDiffEvents({ changedPaths });
        const fallbackEvents = diffTracker.buildFallbackEvents({
          appliedPaths: diffEvents.length === 0 ? changedPaths : [],
          skippedPaths: unresolvedPaths,
          failedPaths: (persistedMessage.failed ?? [])
            .map((item) => ({ path: item.filename ?? "", error: item.error })),
        });
        const persistedEvents = [...diffEvents, ...fallbackEvents];
        events.push(...persistedEvents);
        persistedEvents.forEach((event) => args.onEvent?.(event));
        continue;
      }
      if (message.type === "stream_event") {
        const streamMsg = message as { type: "stream_event"; event: unknown };
        const streamEvent = streamMsg.event as { type?: string; delta?: { type?: string } };
        if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "text_delta") {
          hasStreamedText = true;
        }
        if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "thinking_delta") {
          hasStreamedThinking = true;
        }
      }
      if (message.type === "result") {
        finalStopReason = (message as SDKResultMessage).stop_reason ?? undefined;
      }
      let normalizedEvents = mapClaudeMessageToEvents({ message, claudeDebugStream });
      // Deduplicate: if text/thinking already came through stream_event deltas, skip the
      // full assistant message duplicates (they contain the same content assembled).
      if (message.type === "assistant" && (hasStreamedText || hasStreamedThinking)) {
        normalizedEvents = normalizedEvents.filter((event) => event.type !== "text" && event.type !== "thinking");
      }
      events.push(...normalizedEvents);
      for (const event of normalizedEvents) {
        args.onEvent?.(event);
      }
    }

    if (events[events.length - 1]?.type !== "done") {
      const done: BridgeEvent = finalStopReason ? { type: "done", stop_reason: finalStopReason } : { type: "done" };
      events.push(done);
      args.onEvent?.(done);
    }

    return events;
  } catch (error) {
    console.warn("[provider-runtime] Claude SDK unavailable", error, diagnostics);
    const failureEvents: BridgeEvent[] = [
      {
        type: "error",
        message: `Claude runtime failure: ${toText(error)} | diagnostics=${toText(diagnostics ?? {
          executablePath: selectedClaudePath || "<sdk-default>",
        })}`,
        recoverable: true,
      },
      { type: "done" },
    ];
    failureEvents.forEach((event) => args.onEvent?.(event));
    return failureEvents;
  } finally {
    releaseCurrentRun?.();
    if (activeRunByTask.get(taskKey) === chainedRun) {
      activeRunByTask.delete(taskKey);
    }
  }
}

