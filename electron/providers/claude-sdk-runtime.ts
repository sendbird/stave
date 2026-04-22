import type {
  BridgeEvent,
  ProviderResponderResult,
  StreamTurnArgs,
} from "./types";
import {
  buildProviderTurnPrompt,
  filterPromptRetrievedContext,
  resolveProviderResumeSessionId,
} from "../../src/lib/providers/provider-request-translators";
import {
  MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
  sanitizeTextField,
} from "../../src/lib/file-context-sanitization";
import { parsePullRequestSuggestionResponse } from "../../src/lib/source-control-pr";
import type {
  ClaudeContextUsageResponse,
  ClaudeMcpServerStatusSnapshot,
  ClaudePluginReloadResponse,
} from "../../src/lib/providers/provider.types";
import type {
  CanUseTool,
  McpServerConfig,
  McpServerStatus,
  Query,
  SDKMessage,
  SDKAssistantMessage,
  SDKControlGetContextUsageResponse,
  SDKControlReloadPluginsResponse,
  SDKSystemMessage,
  SDKResultMessage,
  SettingSource,
  SlashCommand,
} from "@anthropic-ai/claude-agent-sdk";
import { toText } from "./utils";
import { createTurnDiffTracker } from "./turn-diff-tracker";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import {
  canExecutePath,
  normalizeExecutablePathValue,
} from "./executable-path";
import {
  buildClaudeCliEnv,
  resolveClaudeCliExecutablePath,
} from "./cli-path-env";
import {
  readPrimaryStaveLocalMcpManifest,
  STAVE_LOCAL_MCP_SERVER_NAME,
  toClaudeSdkMcpServerConfig,
} from "../main/stave-local-mcp-manifest";
import {
  parseBooleanEnv,
  parsePositiveIntEnv,
  parseSemverVersion,
  probeExecutableVersion,
  summarizePathHead,
} from "./runtime-shared";
import {
  createBoundedBridgeEventCollector,
  measureBridgeEventBytes,
} from "./provider-buffering";

/**
 * Cache boundary marker for the claude-agent-sdk systemPrompt string[] API.
 * Matches the SDK's SYSTEM_PROMPT_DYNAMIC_BOUNDARY export — inlined here to
 * avoid a flaky ESM named-value import in bun's parallel test runner.
 */
const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__";

/** SDK-level permission modes accepted by the claude-agent-sdk query() API. */
type ClaudePermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

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
const CLAUDE_MUTATING_FILE_TOOL_NAMES = [
  "Edit",
  "MultiEdit",
  "Write",
  "NotebookEdit",
  "TodoWrite",
] as const;
const CLAUDE_PLAN_MODE_MUTATING_TOOL_NAMES = new Set(
  CLAUDE_MUTATING_FILE_TOOL_NAMES.map((toolName) => toolName.toLowerCase()),
);
const CLAUDE_AUTO_ALLOWED_TOOL_NAMES = new Set(["exitplanmode"]);
/**
 * Claude Code built-in tools that cannot mutate the filesystem or task state.
 * In plan mode these are safe to auto-allow — the whole point of plan mode is
 * that only read-only work is permitted, so surfacing an approval prompt for
 * each Read/Grep/Glob/WebFetch/WebSearch/BashOutput/NotebookRead call is pure
 * noise. Bash is intentionally excluded: even "read-only" commands can have
 * network side effects, so we keep prompting for it.
 */
const CLAUDE_READ_ONLY_BUILTIN_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "ls",
  "notebookread",
  "webfetch",
  "websearch",
  "bashoutput",
  "todoread",
]);
const CLAUDE_AUTO_ALLOWED_MCP_TOOL_NAMES = new Set([
  "stave_get_workspace_information",
  "stave_replace_workspace_notes",
  "stave_append_workspace_notes",
  "stave_clear_workspace_notes",
  "stave_add_workspace_todo",
  "stave_update_workspace_todo",
  "stave_remove_workspace_todo",
  "stave_add_workspace_resource",
  "stave_remove_workspace_resource",
  "stave_add_workspace_jira_issue",
  "stave_add_workspace_confluence_page",
  "stave_add_workspace_figma_resource",
  "stave_add_workspace_slack_thread",
  "stave_add_workspace_custom_field",
  "stave_set_workspace_custom_field",
  "stave_remove_workspace_custom_field",
]);
const CLAUDE_EVENT_RETAINED_BYTES_MAX = 2 * 1024 * 1024;
const CLAUDE_OVERFLOW_TAIL_EVENTS: BridgeEvent[] = [
  {
    type: "error",
    message:
      "Claude turn output was truncated in non-stream replay because the retained snapshot limit was exceeded.",
    recoverable: true,
  },
  { type: "done", stop_reason: "output_overflow" },
];
const CLAUDE_OVERFLOW_TAIL_BYTES = CLAUDE_OVERFLOW_TAIL_EVENTS.reduce(
  (total, event) => total + measureBridgeEventBytes(event),
  0,
);
const CLAUDE_MUTATING_BASH_PATTERNS = [
  /(^|[;&|]\s*)(mkdir|mktemp|rm|rmdir|mv|cp|install|touch|chmod|chown|ln|truncate)\b/i,
  /(^|[;&|]\s*)git\s+(add|am|apply|checkout|cherry-pick|clean|commit|merge|rebase|reset|restore|revert|rm|stash)\b/i,
  /(^|[;&|]\s*)(npm|pnpm|yarn|bun)\s+(add|install|remove|rm|uninstall|update|upgrade)\b/i,
  /(^|[;&|]\s*)(sed|perl)\b[^\n]*\s-i(?:\s|$)/i,
  /(^|[;&|]\s*)tee\b/i,
  /(^|[;&|]\s*)cat\b[^\n]*\s\d*(?:>>|>(?![&]))/i,
  /\s\d*(?:>>|>(?![&]))/,
] as const;

// ---------------------------------------------------------------------------
// Prewarm: eagerly cache the SDK module import and executable path resolution
// so the first query() call doesn't pay those costs.
// ---------------------------------------------------------------------------

let prewarmSdkModulePromise: Promise<
  typeof import("@anthropic-ai/claude-agent-sdk")
> | null = null;
let prewarmExecutablePath: string | null = null;

async function getPrewarmedSdkModule(): Promise<
  typeof import("@anthropic-ai/claude-agent-sdk")
> {
  if (!prewarmSdkModulePromise) {
    prewarmSdkModulePromise = import("@anthropic-ai/claude-agent-sdk");
  }
  return prewarmSdkModulePromise;
}

function getPrewarmedExecutablePath(): string {
  if (prewarmExecutablePath == null) {
    prewarmExecutablePath = resolveClaudeExecutablePath();
  }
  return prewarmExecutablePath;
}

function resolveClaudeRuntimeExecutablePath(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const explicitPath = normalizeExecutablePathValue({
    value: args.runtimeOptions?.claudeBinaryPath,
  });
  if (explicitPath) {
    return explicitPath;
  }
  return getPrewarmedExecutablePath();
}

/**
 * Trigger eager SDK module import and executable path resolution.
 * Call this early (e.g. at app startup) so the first query() is fast.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function prewarmClaudeSdk(): void {
  getPrewarmedSdkModule().catch(() => {
    // Reset so next attempt retries
    prewarmSdkModulePromise = null;
  });
  getPrewarmedExecutablePath();
}

function resolveClaudePermissionMode(args: {
  runtimeValue?: ClaudePermissionMode;
  envValue?: string;
  fallback: ClaudePermissionMode;
}): ClaudePermissionMode {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate === "default" ||
    candidate === "acceptEdits" ||
    candidate === "bypassPermissions" ||
    candidate === "plan" ||
    candidate === "dontAsk" ||
    candidate === "auto"
  ) {
    return candidate;
  }
  return args.fallback;
}

export function resolveClaudeExecutablePath(
  args: { explicitPath?: string } = {},
) {
  return resolveClaudeCliExecutablePath({
    explicitPath: args.explicitPath,
  });
}

export function buildClaudeEnv(args: { executablePath: string }) {
  return buildClaudeCliEnv({ executablePath: args.executablePath });
}

function buildClaudeDiagnostics(args: {
  executablePath: string;
  taskId?: string;
  cwd: string;
}) {
  const env = buildClaudeEnv({ executablePath: args.executablePath });
  const versionProbe = args.executablePath
    ? probeExecutableVersion({
        executablePath: args.executablePath,
        env,
      })
    : null;

  return {
    taskId: args.taskId ?? "default",
    cwd: args.cwd,
    executablePath: args.executablePath || "<sdk-default>",
    executableExists: args.executablePath
      ? canExecutePath({ path: args.executablePath })
      : null,
    envPathHead: summarizePathHead({ value: env.PATH }),
    electronEnv: {
      ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE ?? "",
      ELECTRON_NO_ATTACH_CONSOLE: process.env.ELECTRON_NO_ATTACH_CONSOLE ?? "",
      ELECTRON_NO_ASAR: process.env.ELECTRON_NO_ASAR ?? "",
    },
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

function normalizeClaudeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function normalizeClaudeSkillSlug(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const withoutPrefix = firstToken.replace(/^[/$]+/, "");
  const slug = withoutPrefix.match(/^[A-Za-z0-9._-]+/)?.[0]?.toLowerCase();
  return slug || null;
}

function extractClaudeSkillSlugFromRecord(input: Record<string, unknown>) {
  const candidateKeys = [
    "skill",
    "slug",
    "name",
    "command",
    "skill_name",
    "skillName",
  ] as const;
  for (const key of candidateKeys) {
    const value = input[key];
    if (typeof value !== "string") {
      continue;
    }
    const slug = normalizeClaudeSkillSlug(value);
    if (slug) {
      return slug;
    }
  }
  return null;
}

export function extractClaudeRequestedSkillSlug(args: {
  input: Record<string, unknown>;
}) {
  const direct = extractClaudeSkillSlugFromRecord(args.input);
  if (direct) {
    return direct;
  }
  const nestedInput = args.input.input;
  if (
    nestedInput &&
    typeof nestedInput === "object" &&
    !Array.isArray(nestedInput)
  ) {
    return extractClaudeSkillSlugFromRecord(
      nestedInput as Record<string, unknown>,
    );
  }
  return null;
}

export function shouldRedirectClaudePreloadedSkillToolUse(args: {
  toolName: string;
  input: Record<string, unknown>;
  preloadedSkillSlugs: ReadonlySet<string>;
}) {
  if (args.toolName.trim().toLowerCase() !== "skill") {
    return null;
  }
  if (args.preloadedSkillSlugs.size === 0) {
    return null;
  }
  const slug = extractClaudeRequestedSkillSlug({ input: args.input });
  if (!slug || !args.preloadedSkillSlugs.has(slug)) {
    return null;
  }
  return slug;
}

function collectClaudeActivatedSkillSlugs(args: {
  conversation?: StreamTurnArgs["conversation"];
}) {
  const activatedSkillSlugs = new Set<string>();
  args.conversation?.contextParts.forEach((part) => {
    if (part.type !== "skill_context") {
      return;
    }
    part.skills.forEach((skill) => {
      [skill.slug, skill.invocationToken, skill.name].forEach((value) => {
        const normalized = normalizeClaudeSkillSlug(value);
        if (normalized) {
          activatedSkillSlugs.add(normalized);
        }
      });
    });
  });
  return activatedSkillSlugs;
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
  console.warn(
    "[claude-sdk-runtime] invalid permission callback result; falling back to deny",
    {
      context: args.context,
      error: parsed.error.flatten(),
    },
  );
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
      ...(typeof args.interrupt === "boolean"
        ? { interrupt: args.interrupt }
        : {}),
    },
    fallbackMessage: args.message,
    context: args.context,
  });
}

function extractClaudeBashCommand(input: Record<string, unknown>) {
  for (const key of ["command", "cmd", "script", "bash", "input"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const rendered = toText(input).trim();
  return rendered.length > 0 ? rendered : undefined;
}

function isMutatingClaudeBashCommand(command: string) {
  return CLAUDE_MUTATING_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

export function resolveClaudeDisallowedTools(args: {
  permissionMode: ClaudePermissionMode;
  runtimeDisallowedTools?: readonly string[] | null;
}) {
  const merged = new Set<string>();
  if (Array.isArray(args.runtimeDisallowedTools)) {
    args.runtimeDisallowedTools.forEach((toolName) => {
      if (typeof toolName === "string" && toolName.trim().length > 0) {
        merged.add(toolName.trim());
      }
    });
  }
  if (args.permissionMode === "plan") {
    CLAUDE_MUTATING_FILE_TOOL_NAMES.forEach((toolName) => {
      merged.add(toolName);
    });
  }
  return [...merged];
}

export function shouldDenyClaudeToolInPlanMode(args: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  const normalizedToolName = args.toolName.trim().toLowerCase();
  if (CLAUDE_PLAN_MODE_MUTATING_TOOL_NAMES.has(normalizedToolName)) {
    return true;
  }
  if (normalizedToolName !== "bash") {
    return false;
  }
  const command = extractClaudeBashCommand(args.input);
  return typeof command === "string" && isMutatingClaudeBashCommand(command);
}

export function resolveClaudePermissionModeDecision(args: {
  permissionMode: ClaudePermissionMode;
  toolName: string;
}) {
  const normalizedToolName = args.toolName.trim().toLowerCase();
  if (CLAUDE_AUTO_ALLOWED_TOOL_NAMES.has(normalizedToolName)) {
    return "allow" as const;
  }
  const leafToolName =
    normalizedToolName.split("__").at(-1) ?? normalizedToolName;
  if (CLAUDE_AUTO_ALLOWED_MCP_TOOL_NAMES.has(leafToolName)) {
    return "allow" as const;
  }
  if (args.permissionMode === "bypassPermissions") {
    return "allow" as const;
  }
  if (
    (args.permissionMode === "acceptEdits" || args.permissionMode === "auto") &&
    CLAUDE_PLAN_MODE_MUTATING_TOOL_NAMES.has(normalizedToolName)
  ) {
    return "allow" as const;
  }
  // Plan mode is read-only by construction: mutating tools are hard-denied in
  // the canUseTool callback, so every remaining Claude Code built-in read tool
  // can be auto-allowed. Prompting the user for each Read/Grep/Glob call in a
  // read-only mode is redundant friction.
  if (
    args.permissionMode === "plan" &&
    CLAUDE_READ_ONLY_BUILTIN_TOOL_NAMES.has(normalizedToolName)
  ) {
    return "allow" as const;
  }
  if (args.permissionMode === "dontAsk") {
    return "deny" as const;
  }
  return "prompt" as const;
}

export function shouldAutoAllowClaudeTool(args: {
  toolName: string;
  permissionMode?: ClaudePermissionMode;
}) {
  return resolveClaudePermissionModeDecision({
    permissionMode: args.permissionMode ?? "default",
    toolName: args.toolName,
  }) === "allow";
}

async function resolveEmbeddedStaveLocalMcpServers(): Promise<
  Record<string, McpServerConfig> | undefined
> {
  const manifest = await readPrimaryStaveLocalMcpManifest();
  if (!manifest) {
    return undefined;
  }
  return {
    [STAVE_LOCAL_MCP_SERVER_NAME]: toClaudeSdkMcpServerConfig(manifest),
  };
}

function buildClaudePlanModeDenyMessage(args: { toolName: string }) {
  if (args.toolName.trim().toLowerCase() === "bash") {
    return "Claude plan mode denied a mutating Bash command. Planning turns cannot modify files or task state.";
  }
  return `Claude plan mode denied ${args.toolName}. Planning turns cannot modify files or task state.`;
}

export function buildClaudeSystemPrompt(args: {
  cwd: string;
  baseSystemPrompt?: string;
  responseStylePrompt?: string;
}): string[] {
  const workspacePrompt = [
    "Stave workspace context:",
    `Current workspace root: ${args.cwd}`,
    "Resolve every relative filesystem path against the workspace root above.",
    "Do not rewrite a user-provided relative path like ./docs into a sibling directory outside that workspace root.",
    "If the user explicitly asks to access a path outside the workspace root, keep the exact requested path and request approval instead of guessing a nearby absolute path.",
  ].join("\n");

  // Static prefix — eligible for cross-session prompt caching.
  const staticParts: string[] = [];
  const baseSystemPrompt = args.baseSystemPrompt?.trim();
  if (baseSystemPrompt) {
    staticParts.push(baseSystemPrompt);
  }
  const responseStyle = args.responseStylePrompt?.trim();
  if (responseStyle) {
    staticParts.push(responseStyle);
  }

  // Dynamic suffix — session-specific, not globally cached.
  const dynamicParts: string[] = [workspacePrompt];

  return [
    staticParts.join("\n\n"),
    SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    dynamicParts.join("\n\n"),
  ];
}

function extractClaudeTerminalIssue(args: { stdoutTail: string }) {
  const source = args.stdoutTail;
  if (
    source.includes('"error":"rate_limit"') ||
    source.includes('"rate_limit_event"')
  ) {
    const quoted = source.match(/"You've hit your limit[^"]*"/);
    if (quoted?.[0]) {
      return quoted[0].slice(1, -1);
    }
    return null;
  }
  if (source.includes('"error":"authentication_failed"')) {
    return "Claude authentication failed. Run `claude auth login` and retry.";
  }
  if (source.includes('"error":"billing_error"')) {
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
    ? sanitizeTextField({
        value: details.join("\n"),
        label: "approval description",
        maxChars: MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
      })
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
    const question =
      typeof candidate.question === "string" ? candidate.question : "";
    const header = typeof candidate.header === "string" ? candidate.header : "";
    const options = Array.isArray(candidate.options)
      ? candidate.options.flatMap((rawOption) => {
          if (!rawOption || typeof rawOption !== "object") {
            return [];
          }
          const option = rawOption as Record<string, unknown>;
          if (
            typeof option.label !== "string" ||
            typeof option.description !== "string"
          ) {
            return [];
          }
          return [
            {
              label: option.label,
              description: option.description,
            },
          ];
        })
      : [];
    if (!question || !header || options.length === 0) {
      return [];
    }
    return [
      {
        question,
        header,
        options,
        ...(typeof candidate.multiSelect === "boolean"
          ? { multiSelect: candidate.multiSelect }
          : {}),
      },
    ];
  });
}

export class ClaudeToolDecisionTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Claude tool permission request timed out after ${timeoutMs}ms.`);
    this.name = "ClaudeToolDecisionTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export const CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS = 30 * 60 * 1000;

export function resolveClaudeApprovalDecisionTimeoutMs(args: {
  envValue?: string;
  override?: number;
}) {
  if (typeof args.override === "number" && Number.isFinite(args.override)) {
    return Math.max(0, Math.floor(args.override));
  }
  return parsePositiveIntEnv({
    value: args.envValue,
    fallback: CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  });
}

export function waitForClaudeToolDecision<T>(args: {
  signal: AbortSignal;
  register: (resolve: (value: T) => void) => () => void;
  /**
   * Maximum time in milliseconds to wait for the responder to resolve the
   * decision. When exceeded, the promise rejects with a
   * {@link ClaudeToolDecisionTimeoutError}. Pass `0` (or omit) to disable.
   * This is the last line of defence against responder routing bugs — it
   * prevents the SDK promise from hanging forever when
   * `registerApprovalResponder`/`registerUserInputResponder` fail to invoke
   * the registered resolver (e.g. turn id mismatch, session cleaned up
   * early).
   */
  timeoutMs?: number;
}) {
  return new Promise<T>((resolve, reject) => {
    if (args.signal.aborted) {
      reject(new Error("Claude tool permission request aborted."));
      return;
    }
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const clearTimeoutHandle = () => {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };
    const cleanup = args.register((value) => {
      clearTimeoutHandle();
      args.signal.removeEventListener("abort", handleAbort);
      resolve(value);
    });
    const handleAbort = () => {
      clearTimeoutHandle();
      cleanup();
      reject(new Error("Claude tool permission request aborted."));
    };
    args.signal.addEventListener("abort", handleAbort, { once: true });
    const timeoutMs = args.timeoutMs ?? 0;
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        args.signal.removeEventListener("abort", handleAbort);
        cleanup();
        reject(new ClaudeToolDecisionTimeoutError(timeoutMs));
      }, timeoutMs);
    }
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

export function buildClaudeApprovalTimeoutBridgeEvent(args: {
  kind: "approval" | "user_input";
  toolName: string;
  requestId: string;
  timeoutMs: number;
}): BridgeEvent {
  const seconds = Math.round(args.timeoutMs / 1000);
  const label = args.kind === "user_input" ? "answer" : "approval";
  return {
    type: "error",
    message: `Stave did not receive an ${label} decision for ${args.toolName} (request ${args.requestId}) within ${seconds}s. The tool was denied automatically so the turn could continue. If this happened while you were reviewing the request, the approval responder may have been lost — please report this with the devtools console logs.`,
    recoverable: true,
  };
}

function emitClaudeApprovalTimeoutBridgeEvent(args: {
  eventCollector: ReturnType<typeof createBoundedBridgeEventCollector>;
  onEvent?: (event: BridgeEvent) => void;
  kind: "approval" | "user_input";
  toolName: string;
  requestId: string;
  timeoutMs: number;
}) {
  const event = buildClaudeApprovalTimeoutBridgeEvent({
    kind: args.kind,
    toolName: args.toolName,
    requestId: args.requestId,
    timeoutMs: args.timeoutMs,
  });
  args.eventCollector.append(event);
  args.onEvent?.(event);
}

function toClaudeThinkingConfig(
  thinkingMode?: "adaptive" | "enabled" | "disabled",
) {
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

function resolveClaudeSettingSources(
  value?: NonNullable<StreamTurnArgs["runtimeOptions"]>["claudeSettingSources"],
) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: SettingSource[] = [];
  value.forEach((source) => {
    if (
      (source === "user" || source === "project" || source === "local") &&
      !normalized.includes(source)
    ) {
      normalized.push(source);
    }
  });
  return normalized;
}

function resolveClaudeTaskBudget(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return { total: Math.floor(value) };
}

function buildClaudeQueryOptions(args: {
  cwd: string;
  claudeExecutablePath: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  permissionMode?: ClaudePermissionMode;
  resume?: string;
  systemPrompt?: string | string[];
  includePartialMessages?: boolean;
  promptSuggestions?: boolean;
  canUseTool?: CanUseTool;
  mcpServers?: Record<string, McpServerConfig>;
}) {
  const permissionMode =
    args.permissionMode ??
    resolveClaudePermissionMode({
      runtimeValue: args.runtimeOptions?.claudePermissionMode,
      envValue: process.env.STAVE_CLAUDE_PERMISSION_MODE?.trim(),
      fallback: "acceptEdits",
    });
  const allowDangerouslySkipPermissions =
    args.runtimeOptions?.claudeAllowDangerouslySkipPermissions ??
    parseBooleanEnv({
      value: process.env.STAVE_CLAUDE_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS,
      fallback: permissionMode === "bypassPermissions",
    });
  const claudeSandboxEnabled =
    args.runtimeOptions?.claudeSandboxEnabled ??
    parseBooleanEnv({
      value: process.env.STAVE_CLAUDE_SANDBOX_ENABLED,
      fallback: false,
    });
  const claudeAllowUnsandboxedCommands =
    args.runtimeOptions?.claudeAllowUnsandboxedCommands ??
    parseBooleanEnv({
      value: process.env.STAVE_CLAUDE_ALLOW_UNSANDBOXED_COMMANDS,
      fallback: true,
    });
  const thinking = toClaudeThinkingConfig(
    args.runtimeOptions?.claudeThinkingMode,
  );
  const agentProgressSummaries = resolveClaudeAgentProgressSummaries(
    args.runtimeOptions?.claudeAgentProgressSummaries,
  );
  const settingSources = resolveClaudeSettingSources(
    args.runtimeOptions?.claudeSettingSources,
  );
  const taskBudget = resolveClaudeTaskBudget(
    args.runtimeOptions?.claudeTaskBudgetTokens,
  );
  const disallowedTools = resolveClaudeDisallowedTools({
    permissionMode,
    runtimeDisallowedTools: args.runtimeOptions?.claudeDisallowedTools,
  });

  return {
    permissionMode,
    ...(permissionMode === "bypassPermissions"
      ? { allowDangerouslySkipPermissions }
      : {}),
    ...(args.resume ? { resume: args.resume } : {}),
    ...(args.includePartialMessages ? { includePartialMessages: true } : {}),
    promptSuggestions: args.promptSuggestions ?? false,
    cwd: args.cwd,
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
    ...(typeof args.runtimeOptions?.claudeMaxTurns === "number"
      ? { maxTurns: args.runtimeOptions.claudeMaxTurns }
      : {}),
    ...(typeof args.runtimeOptions?.claudeMaxBudgetUsd === "number"
      ? { maxBudgetUsd: args.runtimeOptions.claudeMaxBudgetUsd }
      : {}),
    ...(taskBudget ? { taskBudget } : {}),
    ...(args.runtimeOptions?.claudeEffort
      ? { effort: args.runtimeOptions.claudeEffort }
      : {}),
    ...(thinking ? { thinking } : {}),
    ...(agentProgressSummaries !== undefined ? { agentProgressSummaries } : {}),
    ...(args.runtimeOptions?.claudeAllowedTools
      ? { allowedTools: args.runtimeOptions.claudeAllowedTools }
      : {}),
    ...(disallowedTools.length > 0 ? { disallowedTools } : {}),
    ...(settingSources !== undefined ? { settingSources } : {}),
    ...(args.runtimeOptions?.claudeAdvisorModel
      ? { advisorModel: args.runtimeOptions.claudeAdvisorModel }
      : {}),
    ...(args.runtimeOptions?.claudeFastMode
      ? { settings: { fastMode: true } }
      : {}),
    ...(args.canUseTool ? { canUseTool: args.canUseTool } : {}),
    ...(args.mcpServers ? { mcpServers: args.mcpServers } : {}),
    sandbox: {
      enabled: claudeSandboxEnabled,
      allowUnsandboxedCommands: claudeAllowUnsandboxedCommands,
    },
    env: buildClaudeEnv({ executablePath: args.claudeExecutablePath }),
    ...(args.claudeExecutablePath.length > 0
      ? { pathToClaudeCodeExecutable: args.claudeExecutablePath }
      : {}),
  };
}

function toClaudeMcpServerStatusSnapshot(
  status: McpServerStatus,
): ClaudeMcpServerStatusSnapshot {
  return {
    name: status.name,
    status: status.status,
    ...(status.error ? { error: status.error } : {}),
    ...(status.scope ? { scope: status.scope } : {}),
    ...(Array.isArray(status.tools) ? { toolCount: status.tools.length } : {}),
  };
}

function toClaudeContextUsageSnapshot(
  usage: SDKControlGetContextUsageResponse,
) {
  return {
    categories: usage.categories.map((category) => ({
      name: category.name,
      tokens: category.tokens,
      color: category.color,
      ...(category.isDeferred !== undefined
        ? { isDeferred: category.isDeferred }
        : {}),
    })),
    totalTokens: usage.totalTokens,
    maxTokens: usage.maxTokens,
    rawMaxTokens: usage.rawMaxTokens,
    percentage: usage.percentage,
    model: usage.model,
    memoryFiles: usage.memoryFiles.map((file) => ({
      path: file.path,
      type: file.type,
      tokens: file.tokens,
    })),
    mcpTools: usage.mcpTools.map((tool) => ({
      name: tool.name,
      serverName: tool.serverName,
      tokens: tool.tokens,
      ...(tool.isLoaded !== undefined ? { isLoaded: tool.isLoaded } : {}),
    })),
  };
}

function toClaudePluginReloadSnapshot(reload: SDKControlReloadPluginsResponse) {
  return {
    commandCount: reload.commands.length,
    agentCount: reload.agents.length,
    plugins: reload.plugins.map((plugin) => ({
      name: plugin.name,
      path: plugin.path,
      ...(plugin.source ? { source: plugin.source } : {}),
    })),
    mcpServers: reload.mcpServers.map(toClaudeMcpServerStatusSnapshot),
    errorCount: reload.error_count,
  };
}

function buildClaudeTaskProgressEvents(
  message: SDKSystemMessage & {
    subtype?: string;
    summary?: string;
  },
) {
  if (message.subtype !== "task_progress") {
    return [];
  }
  const summary = message.summary?.trim();
  if (!summary) {
    return [];
  }
  return [
    {
      type: "system" as const,
      content: `Subagent progress: ${summary}`,
    },
  ];
}

// ── Subagent progress tracking ────────────────────────────────────────────────
// Correlates task_progress SDK messages with their originating Agent tool_use_id
// using hook metadata (agent_id) when available, falling back to the most recent
// active Agent tool call.

function extractStringField(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const val = obj[key];
  return typeof val === "string" && val.trim().length > 0
    ? val.trim()
    : undefined;
}

function isAgentToolName(name: string): boolean {
  return name.trim().toLowerCase() === "agent";
}

export class SubagentProgressTracker {
  /** agent_id (from SDK hooks) → toolUseId (from tool events). */
  private readonly agentIdToToolUseId = new Map<string, string>();
  /** Ordered list of Agent tool_use_ids that have not yet received a result. */
  private readonly pendingAgentToolUseIds: string[] = [];

  /**
   * Call for every BridgeEvent that is about to be emitted so the tracker can
   * record Agent tool starts and completions.
   */
  trackEvent(event: BridgeEvent): void {
    if (
      event.type === "tool" &&
      isAgentToolName(event.toolName) &&
      event.toolUseId
    ) {
      this.pendingAgentToolUseIds.push(event.toolUseId);
    }
    if (event.type === "tool_result") {
      const idx = this.pendingAgentToolUseIds.indexOf(event.tool_use_id);
      if (idx !== -1) {
        this.pendingAgentToolUseIds.splice(idx, 1);
      }
    }
  }

  /**
   * Extract agent_id / tool_use_id from hook-related SDK messages and persist
   * the mapping so future task_progress events can be resolved.
   */
  processRawMessage(message: Record<string, unknown>): void {
    const type = message.type;
    if (
      type !== "hook_started" &&
      type !== "hook_response" &&
      type !== "hook_progress"
    ) {
      return;
    }
    const input =
      typeof message.input === "object" && message.input !== null
        ? (message.input as Record<string, unknown>)
        : null;

    const agentId =
      extractStringField(message, "agent_id") ??
      extractStringField(input, "agent_id");
    const toolUseId =
      extractStringField(message, "tool_use_id") ??
      extractStringField(input, "tool_use_id");

    if (agentId && toolUseId) {
      this.agentIdToToolUseId.set(agentId, toolUseId);
    }
  }

  /**
   * Given a raw task_progress SDK message, determine which Agent tool_use_id
   * the progress belongs to.
   *
   * Resolution order:
   *  1. Direct `tool_use_id` field on the progress message
   *  2. `agent_id` field mapped through hook metadata
   *  3. Most recently started active Agent (positional heuristic)
   */
  resolveToolUseId(
    progressMessage: Record<string, unknown>,
  ): string | undefined {
    const directToolUseId = extractStringField(progressMessage, "tool_use_id");
    if (
      directToolUseId &&
      this.pendingAgentToolUseIds.includes(directToolUseId)
    ) {
      return directToolUseId;
    }

    const agentId = extractStringField(progressMessage, "agent_id");
    if (agentId) {
      const mapped = this.agentIdToToolUseId.get(agentId);
      if (mapped) {
        return mapped;
      }
    }

    // Fallback: last pending Agent tool_use_id
    return this.pendingAgentToolUseIds.at(-1);
  }
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
    ...(typeof resultMsg.ttft_ms === "number"
      ? { ttftMs: resultMsg.ttft_ms }
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

function resolveGitHeadRef(args: { cwd?: string }) {
  if (!args.cwd) {
    return undefined;
  }
  try {
    const output = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: args.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const gitRef = output.trim().split("\n")[0]?.trim();
    return gitRef || undefined;
  } catch {
    return undefined;
  }
}

type ClaudePlanStreamBlockState = {
  sourceSegmentId?: string;
  partialJson: string;
  lastPlanText?: string;
};

type ClaudePlanStreamState = {
  exitPlanBlocksByIndex: Map<number, ClaudePlanStreamBlockState>;
};

function createClaudePlanStreamState(): ClaudePlanStreamState {
  return {
    exitPlanBlocksByIndex: new Map<number, ClaudePlanStreamBlockState>(),
  };
}

function normalizeClaudeStreamIndex(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function extractClaudeToolUseId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function extractClaudePlanTextFromToolInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const plan = (input as Record<string, unknown>).plan;
  return typeof plan === "string" && plan.trim().length > 0 ? plan : null;
}

function parseClaudeToolInputJson(partialJson: string) {
  const trimmed = partialJson.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildClaudePlanReadyEvent(args: {
  planText: string;
  sourceSegmentId?: string;
}): BridgeEvent {
  return {
    type: "plan_ready",
    planText: args.planText,
    ...(args.sourceSegmentId ? { sourceSegmentId: args.sourceSegmentId } : {}),
  };
}

function buildClaudeFallbackPlanSegmentId(index: number) {
  return `claude-exit-plan-${index}`;
}

function mapClaudeStreamPlanEvent(args: {
  streamEvent: Record<string, unknown>;
  planState: ClaudePlanStreamState;
}): BridgeEvent[] {
  const { streamEvent, planState } = args;

  if (streamEvent.type === "message_start" || streamEvent.type === "message_stop") {
    planState.exitPlanBlocksByIndex.clear();
    return [];
  }

  if (streamEvent.type === "content_block_start") {
    const index = normalizeClaudeStreamIndex(streamEvent.index);
    const contentBlock =
      streamEvent.content_block && typeof streamEvent.content_block === "object"
        ? (streamEvent.content_block as Record<string, unknown>)
        : null;
    if (
      index == null
      || !contentBlock
      || contentBlock.type !== "tool_use"
      || contentBlock.name !== "ExitPlanMode"
    ) {
      return [];
    }

    const sourceSegmentId =
      extractClaudeToolUseId(contentBlock.id)
      ?? buildClaudeFallbackPlanSegmentId(index);
    const initialInput =
      contentBlock.input && typeof contentBlock.input === "object"
        ? (contentBlock.input as Record<string, unknown>)
        : null;
    const initialPlanText = extractClaudePlanTextFromToolInput(initialInput);

    planState.exitPlanBlocksByIndex.set(index, {
      sourceSegmentId,
      partialJson: "",
      lastPlanText: initialPlanText ?? undefined,
    });

    return initialPlanText
      ? [buildClaudePlanReadyEvent({ planText: initialPlanText, sourceSegmentId })]
      : [];
  }

  if (streamEvent.type === "content_block_delta") {
    const index = normalizeClaudeStreamIndex(streamEvent.index);
    const delta =
      streamEvent.delta && typeof streamEvent.delta === "object"
        ? (streamEvent.delta as Record<string, unknown>)
        : null;
    if (index == null || !delta || delta.type !== "input_json_delta") {
      return [];
    }

    const blockState = planState.exitPlanBlocksByIndex.get(index);
    if (!blockState) {
      return [];
    }

    const partialJson = typeof delta.partial_json === "string"
      ? delta.partial_json
      : "";
    if (!partialJson) {
      return [];
    }

    blockState.partialJson += partialJson;
    const parsedInput = parseClaudeToolInputJson(blockState.partialJson);
    const planText = extractClaudePlanTextFromToolInput(parsedInput);
    if (!planText || planText === blockState.lastPlanText) {
      return [];
    }

    blockState.lastPlanText = planText;
    return [
      buildClaudePlanReadyEvent({
        planText,
        sourceSegmentId: blockState.sourceSegmentId,
      }),
    ];
  }

  if (streamEvent.type === "content_block_stop") {
    const index = normalizeClaudeStreamIndex(streamEvent.index);
    if (index == null) {
      return [];
    }

    const blockState = planState.exitPlanBlocksByIndex.get(index);
    if (!blockState) {
      return [];
    }

    planState.exitPlanBlocksByIndex.delete(index);
    const parsedInput = parseClaudeToolInputJson(blockState.partialJson);
    const planText = extractClaudePlanTextFromToolInput(parsedInput);
    if (!planText || planText === blockState.lastPlanText) {
      return [];
    }

    return [
      buildClaudePlanReadyEvent({
        planText,
        sourceSegmentId: blockState.sourceSegmentId,
      }),
    ];
  }

  return [];
}

export function mapClaudeMessageToEvents(args: {
  message: SDKMessage;
  claudeDebugStream: boolean;
  cwd?: string;
  planState?: ClaudePlanStreamState;
}): BridgeEvent[] {
  const { message, claudeDebugStream } = args;

  if (message.type === "system") {
    const sysMsg = message as SDKSystemMessage & {
      subtype?: string;
      content?: string;
      summary?: string;
    };
    if (
      sysMsg.subtype === "local_command_output" &&
      typeof sysMsg.content === "string" &&
      sysMsg.content.trim()
    ) {
      return [{ type: "text", text: sysMsg.content }];
    }
    if (
      sysMsg.subtype === "init" &&
      typeof sysMsg.session_id === "string" &&
      sysMsg.session_id.trim()
    ) {
      return [
        {
          type: "provider_session",
          providerId: "claude-code",
          nativeSessionId: sysMsg.session_id,
        },
      ];
    }
    if (sysMsg.subtype === "compact_boundary") {
      const meta = (sysMsg as { compact_metadata?: { trigger?: string } })
        .compact_metadata;
      const trigger = meta?.trigger ?? "auto";
      const gitRef = resolveGitHeadRef({ cwd: args.cwd });
      return [
        {
          type: "system",
          content: `Context compacted (${trigger}).`,
          compactBoundary: {
            trigger,
            ...(gitRef ? { gitRef } : {}),
          },
        },
      ];
    }
    if (sysMsg.subtype === "status") {
      const status = (sysMsg as { status?: string | null }).status;
      if (status === "compacting") {
        return [
          { type: "system", content: "Compacting conversation context\u2026" },
        ];
      }
      if (status === "requesting") {
        return [
          { type: "system", content: "Sending request to model\u2026" },
        ];
      }
      return [];
    }
    const taskProgressEvents = buildClaudeTaskProgressEvents(sysMsg);
    if (taskProgressEvents.length > 0) {
      return taskProgressEvents;
    }
    if (claudeDebugStream) {
      console.debug(
        "[claude-sdk-runtime] system init",
        sysMsg.subtype,
        sysMsg.session_id,
      );
    }
    return [];
  }

  if (message.type === "assistant") {
    const assistantMsg = message as SDKAssistantMessage;

    if (assistantMsg.error) {
      if (assistantMsg.error === "authentication_failed") {
        return [
          {
            type: "text",
            text: "Claude authentication failed. Run `claude auth login` and retry.",
          },
        ];
      }
      if (assistantMsg.error === "billing_error") {
        return [
          {
            type: "text",
            text: "Claude billing/subscription issue detected. Check plan/payment status and retry.",
          },
        ];
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
        id?: string;
      };
      if (b.type === "text" && b.text) {
        // Claude text currently has no Stave segmentId equivalent. That is
        // acceptable today because streamed text is usually followed by a
        // duplicate assembled assistant message that we suppress later, rather
        // than multiple distinct top-level assistant text items like Codex.
        // If markdown sections ever start collapsing together for Claude,
        // compare this path with the Codex segmentId handling before touching
        // renderer code.
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
        const toolUseId = extractClaudeToolUseId(b.id);
        if (b.name === "ExitPlanMode") {
          const planText = extractClaudePlanTextFromToolInput(b.input) ?? "";
          events.push(buildClaudePlanReadyEvent({
            planText,
            sourceSegmentId: toolUseId,
          }));
          continue;
        }
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
    const streamPlanEvents = args.planState
      ? mapClaudeStreamPlanEvent({
          streamEvent: event as Record<string, unknown>,
          planState: args.planState,
        })
      : [];
    if (streamPlanEvents.length > 0) {
      return streamPlanEvents;
    }
    if (streamEvent.type === "content_block_delta") {
      if (
        streamEvent.delta?.type === "thinking_delta" &&
        streamEvent.delta.thinking
      ) {
        return [
          {
            type: "thinking",
            text: streamEvent.delta.thinking,
            isStreaming: true,
          },
        ];
      }
      if (streamEvent.delta?.type === "text_delta" && streamEvent.delta.text) {
        // Keep this in sync with the assistant text-block note above.
        return [{ type: "text", text: streamEvent.delta.text }];
      }
      return [];
    }
    if (streamEvent.type === "error") {
      return [
        {
          type: "error",
          message: `Claude stream error: ${toText(streamEvent.error ?? streamEvent)}`,
          recoverable: false,
        },
      ];
    }
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] stream_event", streamEvent);
    }
    return [];
  }

  if (
    message.type === "user" ||
    (message as { type: string }).type === "user_message_replay"
  ) {
    // Surface tool_result content blocks so the UI can populate subagent output.
    const userMsg = message as {
      type: string;
      message?: { content?: unknown };
    };
    const userContent = userMsg.message?.content;
    if (Array.isArray(userContent)) {
      const toolResultEvents: BridgeEvent[] = [];
      for (const block of userContent) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const b = block as {
          type?: string;
          tool_use_id?: string;
          content?: unknown;
        };
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
              return cb.type === "text" && typeof cb.text === "string"
                ? [cb.text]
                : [];
            })
            .join("\n");
        }
        toolResultEvents.push({
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          output,
        });
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
        api_error_status?: number | null;
      };
    };
    const info = rlMsg.rate_limit_info;
    if (info?.status === "rejected") {
      const resetTime = info.resetsAt
        ? new Date(info.resetsAt * 1000).toLocaleTimeString()
        : "unknown";
      const statusSuffix =
        info.api_error_status != null ? ` (HTTP ${info.api_error_status})` : "";
      return [
        {
          type: "error",
          message: `Rate limit reached. Resets at ${resetTime}.${statusSuffix}`,
          recoverable: true,
        },
      ];
    }
    if (info?.status === "allowed_warning") {
      const pct =
        info.utilization != null
          ? ` (${Math.round(info.utilization * 100)}% used)`
          : "";
      return [
        {
          type: "system",
          content: `Approaching rate limit${pct}. Consider pacing requests.`,
        },
      ];
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
      return [
        {
          type: "tool_progress",
          toolUseId,
          toolName: progressMsg.tool_name ?? "tool",
          elapsedSeconds: progressMsg.elapsed_time_seconds ?? 0,
        },
      ];
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

  // plugin_install — headless plugin installation progress (SDK 0.2.110+).
  // Subtype lives under the system message umbrella but arrives with type set
  // directly. Surface completed installs as system events; silence the rest.
  if (
    message.type === "system" &&
    (message as { subtype?: string }).subtype === "plugin_install"
  ) {
    const pluginMsg = message as {
      status: "started" | "installed" | "failed" | "completed";
      name?: string;
      error?: string;
    };
    if (pluginMsg.status === "installed" && pluginMsg.name) {
      return [
        { type: "system", content: `Plugin installed: ${pluginMsg.name}` },
      ];
    }
    if (pluginMsg.status === "failed" && pluginMsg.name) {
      return [
        {
          type: "system",
          content: `Plugin install failed: ${pluginMsg.name}${pluginMsg.error ? ` — ${pluginMsg.error}` : ""}`,
        },
      ];
    }
    return [];
  }

  if (
    message.type === "auth_status" ||
    message.type === "task_notification" ||
    message.type === "task_started" ||
    message.type === "task_progress" ||
    message.type === "files_persisted" ||
    message.type === "hook_started" ||
    message.type === "hook_progress" ||
    message.type === "hook_response"
  ) {
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] meta", message.type, message);
    }
    return [];
  }

  if (message.type === "error") {
    return [
      {
        type: "error",
        message: `Claude error: ${toText(message)}`,
        recoverable: false,
      },
    ];
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
    const runtimeCwd =
      args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;

    if (!queryFn) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail:
          "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
      runtimeOptions: args.runtimeOptions,
    });
    const embeddedMcpServers = await resolveEmbeddedStaveLocalMcpServers();

    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
        mcpServers: embeddedMcpServers,
      }),
    }) as Query;

    const commands = await stream.supportedCommands();
    return {
      ok: true,
      supported: true,
      commands: commands.map(toProviderSlashCommand),
      detail:
        commands.length > 0
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

export async function getClaudeContextUsage(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeContextUsageResponse> {
  let stream: Query | null = null;
  try {
    const runtimeCwd =
      args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;

    if (!queryFn) {
      return {
        ok: false,
        detail:
          "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
      runtimeOptions: args.runtimeOptions,
    });
    const embeddedMcpServers = await resolveEmbeddedStaveLocalMcpServers();
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
        mcpServers: embeddedMcpServers,
      }),
    }) as Query;

    const usage = await stream.getContextUsage();
    return {
      ok: true,
      detail: `Loaded Claude context usage for ${runtimeCwd}.`,
      usage: toClaudeContextUsageSnapshot(usage),
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude context usage unavailable: ${toText(error)}`,
    };
  } finally {
    stream?.close();
  }
}

export async function reloadClaudePlugins(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudePluginReloadResponse> {
  let stream: Query | null = null;
  try {
    const runtimeCwd =
      args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;

    if (!queryFn) {
      return {
        ok: false,
        detail:
          "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
      runtimeOptions: args.runtimeOptions,
    });
    const embeddedMcpServers = await resolveEmbeddedStaveLocalMcpServers();
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
        mcpServers: embeddedMcpServers,
      }),
    }) as Query;

    const reload = await stream.reloadPlugins();
    return {
      ok: true,
      detail: `Reloaded Claude plugins for ${runtimeCwd}.`,
      reload: toClaudePluginReloadSnapshot(reload),
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude plugin reload failed: ${toText(error)}`,
    };
  } finally {
    stream?.close();
  }
}

export function cleanupClaudeTask(taskId: string) {
  sessionIdByTask.delete(taskId);
  activeRunByTask.delete(taskId);
}

function resolveSessionId(args: {
  taskId?: string;
  fallbackSessionId?: string;
}) {
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

export async function streamClaudeWithSdk(
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
  // Hoisted to outer scope so the finally block can clean up pending resolvers
  // and close the stream even when an exception is thrown mid-turn.
  const pendingApprovalResolvers = new Map<
    string,
    (approved: boolean) => void
  >();
  const pendingUserInputResolvers = new Map<
    string,
    (response: { answers?: Record<string, string>; denied?: boolean }) => void
  >();
  let stream: Query | null = null;
  try {
    const runtimeCwd =
      args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;

    if (!queryFn) {
      return [
        {
          type: "error",
          message:
            "Claude runtime failure: query() is unavailable from SDK import.",
          recoverable: false,
        },
        { type: "done" },
      ];
    }

    const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
      runtimeOptions: args.runtimeOptions,
    });
    selectedClaudePath = claudeExecutablePath;
    diagnostics = buildClaudeDiagnostics({
      executablePath: claudeExecutablePath,
      taskId: args.taskId,
      cwd: runtimeCwd,
    });
    const eventCollector = createBoundedBridgeEventCollector({
      maxBytes: CLAUDE_EVENT_RETAINED_BYTES_MAX,
      reserveTailBytes: CLAUDE_OVERFLOW_TAIL_BYTES,
    });
    const events = eventCollector.events;
    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
    args.registerApprovalResponder?.(({ requestId, approved }) => {
      const resolver = pendingApprovalResolvers.get(requestId);
      if (!resolver) {
        return {
          ok: false,
          reason: "unknown-request",
          pendingRequestIds: Array.from(pendingApprovalResolvers.keys()),
        };
      }
      pendingApprovalResolvers.delete(requestId);
      resolver(approved);
      return { ok: true };
    });
    args.registerUserInputResponder?.(({ requestId, answers, denied }) => {
      const resolver = pendingUserInputResolvers.get(requestId);
      if (!resolver) {
        return {
          ok: false,
          reason: "unknown-request",
          pendingRequestIds: Array.from(pendingUserInputResolvers.keys()),
        };
      }
      pendingUserInputResolvers.delete(requestId);
      resolver({ answers, denied });
      return { ok: true };
    });

    const existingSessionId = resolveSessionId({
      taskId: args.taskId,
      fallbackSessionId: resolveProviderResumeSessionId({
        conversation: args.conversation,
        fallbackResumeId: args.runtimeOptions?.claudeResumeSessionId,
      }),
    });
    const claudeSystemPrompt = buildClaudeSystemPrompt({
      cwd: runtimeCwd,
      baseSystemPrompt: args.runtimeOptions?.claudeSystemPrompt,
      responseStylePrompt: args.runtimeOptions?.responseStylePrompt,
    });
    const embeddedMcpServers = await resolveEmbeddedStaveLocalMcpServers();
    const claudePermissionMode = resolveClaudePermissionMode({
      runtimeValue: args.runtimeOptions?.claudePermissionMode,
      envValue: process.env.STAVE_CLAUDE_PERMISSION_MODE?.trim(),
      fallback: "acceptEdits",
    });
    const approvalDecisionTimeoutMs = resolveClaudeApprovalDecisionTimeoutMs({
      envValue: process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS,
    });
    const promptConversation = args.conversation
      ? filterPromptRetrievedContext({
          conversation: args.conversation,
          excludedSourceIds: embeddedMcpServers
            ? []
            : ["stave:current-task-awareness"],
        })
      : args.conversation;
    const providerPrompt = buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: promptConversation,
    });
    const activatedSkillSlugs = collectClaudeActivatedSkillSlugs({
      conversation: args.conversation,
    });
    const queryResult = queryFn({
      prompt: providerPrompt,
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        permissionMode: claudePermissionMode,
        resume: existingSessionId,
        systemPrompt: claudeSystemPrompt,
        includePartialMessages: true,
        promptSuggestions: true,
        mcpServers: embeddedMcpServers,
        canUseTool: async (toolName, input, options) => {
          const normalizedInput = normalizeClaudeToolInput(input);
          const requestId = options.toolUseID;
          const redirectedSkillSlug = shouldRedirectClaudePreloadedSkillToolUse(
            {
              toolName,
              input: normalizedInput,
              preloadedSkillSlugs: activatedSkillSlugs,
            },
          );
          if (redirectedSkillSlug) {
            return buildClaudeDenyPermissionResult({
              message: `Skill "${redirectedSkillSlug}" is already activated by Stave. Do not call the Skill tool for it; follow the [Activated Skills] instructions directly.`,
              context: "skill:activated-skill-redirect",
            });
          }

          const permissionModeDecision = resolveClaudePermissionModeDecision({
            permissionMode: claudePermissionMode,
            toolName,
          });

          if (permissionModeDecision === "allow") {
            return buildClaudeApprovalPermissionResult({
              approved: true,
              normalizedInput,
              denialMessage: `Claude auto-allowed ${toolName}.`,
            });
          }

          if (toolName === "AskUserQuestion") {
            const questions = parseClaudeQuestionList({
              input: normalizedInput,
            });
            if (questions.length === 0) {
              return buildClaudeDenyPermissionResult({
                message:
                  "AskUserQuestion was requested without any valid questions.",
                context: "user-input:invalid-questions",
              });
            }

            const userInputEvent: BridgeEvent = {
              type: "user_input",
              toolName,
              requestId,
              questions,
            };
            eventCollector.append(userInputEvent);
            args.onEvent?.(userInputEvent);

            try {
              const response = await waitForClaudeToolDecision({
                signal: options.signal,
                register: (resolve) => {
                  pendingUserInputResolvers.set(requestId, resolve);
                  return () => {
                    pendingUserInputResolvers.delete(requestId);
                  };
                },
                timeoutMs: approvalDecisionTimeoutMs,
              });
              return buildClaudeUserInputPermissionResult({
                normalizedInput,
                answers: response.answers,
                denied: response.denied,
              });
            } catch (error) {
              if (error instanceof ClaudeToolDecisionTimeoutError) {
                emitClaudeApprovalTimeoutBridgeEvent({
                  eventCollector,
                  onEvent: args.onEvent,
                  kind: "user_input",
                  toolName,
                  requestId,
                  timeoutMs: error.timeoutMs,
                });
                return buildClaudeDenyPermissionResult({
                  message: `Stave did not receive an answer for ${toolName} within ${Math.round(error.timeoutMs / 1000)}s. Denied automatically.`,
                  context: "user-input:timeout",
                });
              }
              throw error;
            }
          }

          if (
            claudePermissionMode === "plan" &&
            shouldDenyClaudeToolInPlanMode({
              toolName,
              input: normalizedInput,
            })
          ) {
            return buildClaudeDenyPermissionResult({
              message: buildClaudePlanModeDenyMessage({ toolName }),
              context: "approval:plan-mode-hard-deny",
            });
          }

          if (permissionModeDecision === "deny") {
            return buildClaudeDenyPermissionResult({
              message: `Claude permission mode ${claudePermissionMode} denied ${toolName} without prompting.`,
              context: "approval:permission-mode-deny",
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
          eventCollector.append(approvalEvent);
          args.onEvent?.(approvalEvent);

          try {
            const approved = await waitForClaudeToolDecision({
              signal: options.signal,
              register: (resolve) => {
                pendingApprovalResolvers.set(requestId, resolve);
                return () => {
                  pendingApprovalResolvers.delete(requestId);
                };
              },
              timeoutMs: approvalDecisionTimeoutMs,
            });
            return buildClaudeApprovalPermissionResult({
              approved,
              normalizedInput,
              denialMessage: `User denied permission for ${toolName}.`,
            });
          } catch (error) {
            if (error instanceof ClaudeToolDecisionTimeoutError) {
              emitClaudeApprovalTimeoutBridgeEvent({
                eventCollector,
                onEvent: args.onEvent,
                kind: "approval",
                toolName,
                requestId,
                timeoutMs: error.timeoutMs,
              });
              return buildClaudeDenyPermissionResult({
                message: `Stave did not receive an approval decision for ${toolName} within ${Math.round(error.timeoutMs / 1000)}s. Denied automatically.`,
                context: "approval:timeout",
              });
            }
            throw error;
          }
        },
      }),
    }) as Query;
    stream = queryResult;

    // Register abort handler using the official Query.close() method
    args.registerAbort?.(() => {
      stream?.close();
    });

    let hasStreamedText = false;
    let hasStreamedThinking = false;
    const emittedToolUseIds = new Set<string>();
    const planStreamState = createClaudePlanStreamState();
    let finalStopReason: string | undefined;
    const claudeDebugStream =
      args.runtimeOptions?.debug ?? process.env.STAVE_CLAUDE_DEBUG === "1";
    const subagentTracker = new SubagentProgressTracker();

    for await (const message of stream) {
      if (
        message.type === "system" &&
        (message as SDKSystemMessage).subtype === "init"
      ) {
        rememberSessionId({
          taskId: args.taskId,
          sessionId: (message as SDKSystemMessage).session_id,
        });
      }
      if (
        message.type === "system" &&
        (message as SDKSystemMessage).subtype === "files_persisted"
      ) {
        const persistedMessage = message as SDKSystemMessage & {
          subtype: "files_persisted";
          files?: Array<{ filename?: string }>;
          failed?: Array<{ filename?: string; error?: string }>;
        };
        const changedPaths = (persistedMessage.files ?? [])
          .map((item) => item.filename ?? "")
          .filter(Boolean);
        const { diffEvents, unresolvedPaths } =
          await diffTracker.buildDiffEvents({ changedPaths });
        const fallbackEvents = diffTracker.buildFallbackEvents({
          appliedPaths: diffEvents.length === 0 ? changedPaths : [],
          skippedPaths: unresolvedPaths,
          failedPaths: (persistedMessage.failed ?? []).map((item) => ({
            path: item.filename ?? "",
            error: item.error,
          })),
        });
        const persistedEvents = [...diffEvents, ...fallbackEvents];
        eventCollector.appendMany(persistedEvents);
        persistedEvents.forEach((event) => args.onEvent?.(event));
        continue;
      }

      // Feed hook messages to the subagent tracker for agent_id ↔ toolUseId mapping.
      subagentTracker.processRawMessage(message as Record<string, unknown>);

      // Intercept task_progress messages to emit subagent_progress events with
      // toolUseId correlation instead of generic system events.
      const sysMsg = message as SDKSystemMessage & {
        subtype?: string;
        summary?: string;
      };
      if (sysMsg.type === "system" && sysMsg.subtype === "task_progress") {
        const summary = sysMsg.summary?.trim();
        if (summary) {
          const toolUseId = subagentTracker.resolveToolUseId(
            message as Record<string, unknown>,
          );
          const progressEvent: BridgeEvent = {
            type: "subagent_progress",
            toolUseId,
            content: summary,
          };
          eventCollector.append(progressEvent);
          args.onEvent?.(progressEvent);
        }
        continue;
      }

      if (message.type === "stream_event") {
        const streamMsg = message as { type: "stream_event"; event: unknown };
        const streamEvent = streamMsg.event as {
          type?: string;
          delta?: { type?: string };
        };
        if (
          streamEvent?.type === "content_block_delta" &&
          streamEvent.delta?.type === "text_delta"
        ) {
          hasStreamedText = true;
        }
        if (
          streamEvent?.type === "content_block_delta" &&
          streamEvent.delta?.type === "thinking_delta"
        ) {
          hasStreamedThinking = true;
        }
      }
      if (message.type === "result") {
        finalStopReason =
          (message as SDKResultMessage).stop_reason ?? undefined;
      }
      let normalizedEvents = mapClaudeMessageToEvents({
        message,
        claudeDebugStream,
        cwd: runtimeCwd,
        planState: planStreamState,
      });
      // Deduplicate: if text/thinking already came through stream_event deltas, skip the
      // full assistant message duplicates (they contain the same content assembled).
      if (
        message.type === "assistant" &&
        (hasStreamedText || hasStreamedThinking)
      ) {
        normalizedEvents = normalizedEvents.filter(
          (event) => event.type !== "text" && event.type !== "thinking",
        );
      }
      // Deduplicate tool events: with includePartialMessages the same tool_use
      // block can appear in multiple partial assistant messages. Only keep the
      // first emission per toolUseId so the UI does not create phantom parts.
      normalizedEvents = normalizedEvents.filter((event) => {
        if (event.type !== "tool" || !event.toolUseId) {
          return true;
        }
        if (emittedToolUseIds.has(event.toolUseId)) {
          return false;
        }
        emittedToolUseIds.add(event.toolUseId);
        return true;
      });
      // Let the subagent tracker observe tool starts / completions.
      for (const event of normalizedEvents) {
        subagentTracker.trackEvent(event);
      }
      eventCollector.appendMany(normalizedEvents);
      for (const event of normalizedEvents) {
        args.onEvent?.(event);
      }
    }

    const done: BridgeEvent = finalStopReason
      ? { type: "done", stop_reason: finalStopReason }
      : { type: "done" };
    if (eventCollector.overflowed) {
      for (const overflowEvent of CLAUDE_OVERFLOW_TAIL_EVENTS) {
        eventCollector.appendTail(overflowEvent);
      }
      args.onEvent?.(done);
    } else if (events[events.length - 1]?.type !== "done") {
      eventCollector.appendTail(done);
      args.onEvent?.(done);
    }

    return events;
  } catch (error) {
    // Distinguish abort (user-initiated cancel / stream.close()) from real failures.
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      (error instanceof Error && /aborted|cancel/i.test(error.message));
    if (isAbort) {
      console.info("[provider-runtime] Claude turn aborted", {
        taskId: args.taskId,
      });
      const abortEvents: BridgeEvent[] = [
        { type: "done", stop_reason: "user_abort" },
      ];
      abortEvents.forEach((event) => args.onEvent?.(event));
      return abortEvents;
    }
    console.warn(
      "[provider-runtime] Claude SDK unavailable",
      error,
      diagnostics,
    );
    const failureEvents: BridgeEvent[] = [
      {
        type: "error",
        message: `Claude runtime failure: ${toText(error)} | diagnostics=${toText(
          diagnostics ?? {
            executablePath: selectedClaudePath || "<sdk-default>",
          },
        )}`,
        recoverable: true,
      },
      { type: "done" },
    ];
    failureEvents.forEach((event) => args.onEvent?.(event));
    return failureEvents;
  } finally {
    // ── Cleanup pending resolvers ───────────────────────────────────────
    // If the turn was aborted while waiting for user approval/input, the
    // SDK's options.signal SHOULD abort the pending waitForClaudeToolDecision
    // promise.  However, as a safety net (in case the SDK doesn't propagate
    // abort to canUseTool signals), we forcibly resolve all pending resolvers
    // so that no promise hangs indefinitely.
    for (const [id, resolver] of pendingApprovalResolvers) {
      try {
        resolver(false);
      } catch {
        // Resolver may have already been settled — ignore.
      }
      pendingApprovalResolvers.delete(id);
    }
    for (const [id, resolver] of pendingUserInputResolvers) {
      try {
        resolver({ denied: true });
      } catch {
        // Resolver may have already been settled — ignore.
      }
      pendingUserInputResolvers.delete(id);
    }

    // Ensure the SDK stream is closed (idempotent).
    try {
      stream?.close();
    } catch {
      // stream.close() may throw if already closed — ignore.
    }

    releaseCurrentRun?.();
    if (activeRunByTask.get(taskKey) === chainedRun) {
      activeRunByTask.delete(taskKey);
    }
  }
}

// ── Auto task name suggestion ─────────────────────────────────────────────────
// Runs a lightweight, single-turn Claude query to produce a short title for a
// newly-created task.  Intentionally isolated from the main task session so the
// title query never appears in the user's conversation history.

export async function suggestClaudeTaskName(args: {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<{ ok: boolean; title?: string }> {
  try {
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = getPrewarmedExecutablePath();

    // Build a conversation summary from the last few exchanges (if any).
    const historyLines = (args.history ?? [])
      .slice(-6)
      .map(
        (m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`,
      )
      .join("\n");

    const titlePrompt = [
      "Based on the conversation below, generate a short task title (3-6 words, Title Case) that best describes what this coding task is about overall.",
      "Return ONLY the title — no quotes, no punctuation, no explanation.",
      "",
      ...(historyLines ? [`Conversation so far:\n${historyLines}`, ""] : []),
      `Latest message: ${args.prompt.slice(0, 400)}`,
    ].join("\n");

    const stream = queryFn({
      prompt: titlePrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath
          ? { pathToClaudeCodeExecutable: claudeExecutablePath }
          : {}),
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const contentBlocks = assistantMsg.message?.content;
        if (!Array.isArray(contentBlocks)) continue;
        for (const block of contentBlocks) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && b.text) {
            textParts.push(b.text);
          }
        }
      }
    }

    const title = textParts.join("").trim().split("\n")[0]?.trim();
    return title ? { ok: true, title } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── Auto commit message suggestion ────────────────────────────────────────────
// Runs a lightweight, single-turn Claude query to produce a conventional commit
// message based on the git diff of changed files.  Intentionally isolated from
// the main task session so the query never appears in the user's conversation.

export async function suggestClaudeCommitMessage(args: {
  diff: string;
  fileList: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = getPrewarmedExecutablePath();

    const commitPrompt = [
      "You are a git commit message generator. Generate a single concise commit message following the Conventional Commits specification.",
      "Format: <type>(<optional scope>): <short description>",
      "Allowed types: feat, fix, refactor, style, docs, test, build, ci, chore, perf",
      "Rules:",
      "- Subject line must be 72 characters or fewer",
      "- Use imperative mood (e.g., 'add feature' not 'added feature')",
      "- No period at the end",
      "- Return ONLY the commit message — no quotes, no explanation, no extra lines",
      "",
      "Changed files (git status --porcelain):",
      args.fileList || "(no file list available)",
      ...(args.diff.length > 0
        ? ["", "Git diff (may be truncated):", args.diff.slice(0, 6000)]
        : []),
    ].join("\n");

    const stream = queryFn({
      prompt: commitPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath
          ? { pathToClaudeCodeExecutable: claudeExecutablePath }
          : {}),
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const contentBlocks = assistantMsg.message?.content;
        if (!Array.isArray(contentBlocks)) continue;
        for (const block of contentBlocks) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && b.text) {
            textParts.push(b.text);
          }
        }
      }
    }

    const commitMessage = textParts.join("").trim().split("\n")[0]?.trim();
    return commitMessage ? { ok: true, message: commitMessage } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── Auto PR description suggestion ──────────────────────────────────────────
// Runs a lightweight, single-turn Claude query to produce a pull request title
// and description based on the branch diff and commit log.  Intentionally
// isolated from the main task session so the query never appears in the user's
// conversation.

export async function suggestClaudePRDescription(args: {
  cwd?: string;
  diff: string;
  workingTreeDiff: string;
  commitLog: string;
  fileList: string;
  baseBranch: string;
  headBranch: string;
  prTemplateContent?: string;
  agentsContent?: string;
  promptTemplate?: string;
  workspaceContext?: string;
}): Promise<{ ok: boolean; title?: string; body?: string }> {
  try {
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = getPrewarmedExecutablePath();

    // Use user-provided prompt template or fall back to the built-in default.
    const { DEFAULT_PROMPT_PR_DESCRIPTION } =
      await import("../../src/lib/providers/prompt-defaults");
    const baseTemplate =
      args.promptTemplate?.trim() || DEFAULT_PROMPT_PR_DESCRIPTION;

    const prPrompt = [
      ...(args.prTemplateContent
        ? [
            "Repository pull request template (highest priority for PR body structure):",
            args.prTemplateContent.slice(0, 2000),
            "",
          ]
        : []),
      ...(args.agentsContent
        ? [
            "Repository guidelines from AGENTS.md (apply when consistent with the pull request template):",
            args.agentsContent.slice(0, 2000),
            "",
          ]
        : []),
      ...(args.workspaceContext
        ? [
            "Current workspace context (treat this as the primary source of intent for the PR draft):",
            args.workspaceContext.slice(0, 3000),
            "",
          ]
        : []),
      "Fallback PR generation instructions (use only for gaps not specified above):",
      baseTemplate,
      "",
      `Base branch: ${args.baseBranch}`,
      `Head branch: ${args.headBranch}`,
      "",
      "Commit log:",
      args.commitLog || "(no commits)",
      "",
      "Changed files:",
      args.fileList || "(no file list available)",
      ...(args.diff.length > 0
        ? [
            "",
            "Branch diff against the base branch (may be truncated):",
            args.diff.slice(0, 6000),
          ]
        : []),
      ...(args.workingTreeDiff.length > 0
        ? [
            "",
            "Uncommitted working tree diff (may be truncated):",
            args.workingTreeDiff.slice(0, 4000),
          ]
        : []),
    ].join("\n");

    const stream = queryFn({
      prompt: prPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: args.cwd || process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath
          ? { pathToClaudeCodeExecutable: claudeExecutablePath }
          : {}),
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const contentBlocks = assistantMsg.message?.content;
        if (!Array.isArray(contentBlocks)) continue;
        for (const block of contentBlocks) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && b.text) {
            textParts.push(b.text);
          }
        }
      }
    }

    const fullText = textParts.join("").trim();
    const { title, body } = parsePullRequestSuggestionResponse(fullText);

    return title || body ? { ok: true, title, body } : { ok: false };
  } catch {
    return { ok: false };
  }
}
