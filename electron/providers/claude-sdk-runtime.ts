import type {
  BridgeEvent,
  ProviderResponderResult,
  ProviderSteerResponder,
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
import {
  buildIntentGuardPrompt,
  buildReviewDiffPrompt,
  parseReviewFindings,
  type PrePrReviewFinding,
} from "../../src/lib/source-control-review";
import { isTrustedApproval } from "../../src/lib/providers/trusted-tools";
import {
  DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE,
  type ClaudePlanModeApprovalScope,
} from "../../src/types/chat";
import type {
  ClaudeContextUsageResponse,
  ClaudeFileRewindResponse,
  ClaudeMcpOauthLoginResponse,
  ClaudeMcpServerStatusSnapshot,
  ClaudeMcpStatusResponse,
  ClaudePluginReloadResponse,
  ClaudeSessionForkResponse,
  ProviderMutationResponse,
} from "../../src/lib/providers/provider.types";
import {
  buildWorkerExecutionMetadata,
  buildWorkerPrimaryInstructions,
  resolveWorkerProfile,
  toClaudeWorkerEffort,
  type ResolvedWorkerProfile,
} from "../../src/lib/providers/worker-mode";
import type {
  AgentDefinition,
  CanUseTool,
  HookCallback,
  McpServerConfig,
  McpServerStatus,
  OnElicitation,
  OnUserDialog,
  Options,
  Query,
  SDKMessage,
  SDKAssistantMessage,
  SDKHookProgressMessage,
  SDKHookResponseMessage,
  SDKHookStartedMessage,
  SDKInformationalMessage,
  SDKPermissionDeniedMessage,
  SDKControlGetContextUsageResponse,
  SDKControlReloadPluginsResponse,
  SDKSystemMessage,
  SDKResultMessage,
  SDKUserMessage,
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
import { resolveBoundSecretEnv } from "../main/browser/secret-service";
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
import {
  getClaudeMcpConfigPaths,
  McpConfigRefreshTracker,
} from "./mcp-config-refresh";
import {
  resolveClaudeMcpServers,
  type ClaudeMcpConfigDiagnostic,
} from "./claude-mcp-config";
import { sanitizeMcpDiagnosticText } from "./mcp-config-management-shared";
import { isAlwaysAllowedStaveLocalMcpTool } from "./stave-local-mcp-approval";
import { DEFAULT_READ_ONLY_PROMPT_LABEL } from "./read-only-prompt-labels";
import {
  isClaudeChromeToolName,
  shouldActivateProviderBrowser,
} from "../../src/lib/provider-browser";

/**
 * Cache boundary marker for the claude-agent-sdk systemPrompt string[] API.
 * Matches the SDK's SYSTEM_PROMPT_DYNAMIC_BOUNDARY export — inlined here to
 * avoid a flaky ESM named-value import in bun's parallel test runner.
 */
const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__";

/** SDK-level permission modes accepted by the claude-agent-sdk query() API. */
type ClaudePermissionMode =
  "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";

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
 *
 * TodoWrite is included because it only mutates the in-session todo tracker —
 * no filesystem write — so blocking it in plan mode just broke the agent's
 * own progress tracking and caused mid-plan stalls.
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
  "todowrite",
]);
const STAVE_LOCAL_MCP_TOOL_PREFIX = "mcp__stave-local-mcp__";
/**
 * Tokens that mark a (non-Stave) MCP tool as read-only vs. mutating, used to
 * decide whether plan mode can auto-allow third-party / lens MCP calls when the
 * approval scope is `bashTaskAndMcp`. An MCP tool is treated as read-only only
 * when it contains a read verb AND no write verb — anything ambiguous keeps
 * prompting, so misclassification fails safe (toward asking the user).
 */
const CLAUDE_MCP_READ_VERB_TOKENS = new Set([
  "get",
  "list",
  "search",
  "read",
  "fetch",
  "query",
  "describe",
  "inspect",
  "view",
  "snapshot",
  "screenshot",
  "measure",
  "lookup",
  "resolve",
  "status",
  "log",
  "logs",
  "show",
  "find",
  "count",
  "whoami",
  "info",
  "summary",
  "summarize",
  "summarise",
  "history",
]);
const CLAUDE_MCP_WRITE_VERB_TOKENS = new Set([
  "create",
  "update",
  "delete",
  "write",
  "add",
  "remove",
  "set",
  "post",
  "put",
  "patch",
  "send",
  "merge",
  "upload",
  "edit",
  "move",
  "rename",
  "transition",
  "comment",
  "reply",
  "schedule",
  "run",
  "execute",
  "install",
  "push",
  "fork",
  "assign",
  "react",
  "cancel",
  "close",
  "open",
  "navigate",
  "click",
  "type",
  "download",
  "evaluate",
  "start",
  "stop",
  "apply",
  "submit",
  "approve",
  "reject",
  "clear",
  "replace",
  "mutate",
  "destroy",
  "drop",
  "truncate",
  "revoke",
  "grant",
  "modify",
  "disable",
  "enable",
  "toggle",
  "trigger",
  "fire",
  "dispatch",
  "publish",
  "archive",
  "restore",
  "import",
  "export",
  "sync",
  "refresh",
  "invalidate",
  "purge",
  "flush",
  "register",
  "unregister",
  "link",
  "unlink",
  "attach",
  "detach",
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
const CLAUDE_SECONDARY_NETWORK_BASH_PATTERNS = [
  /(^|[;&|]\s*)(curl|wget|ssh|scp|sftp|ftp|telnet|nc|ncat)\b/i,
  /(^|[;&|]\s*)git\s+(clone|fetch|pull|push|ls-remote)\b/i,
  /\bhttps?:\/\//i,
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

export function buildClaudeEnv(args: { executablePath: string; cwd?: string }) {
  return buildClaudeCliEnv({
    executablePath: args.executablePath,
    cwd: args.cwd,
  });
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

export function shouldDenyClaudeToolInSecondaryReadOnly(args: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  const toolName = args.toolName.trim().toLowerCase();
  if (toolName === "read" || toolName === "glob" || toolName === "grep") {
    return false;
  }
  if (toolName !== "bash") {
    return true;
  }
  const command = extractClaudeBashCommand(args.input);
  if (!command || isMutatingClaudeBashCommand(command)) {
    return true;
  }
  return CLAUDE_SECONDARY_NETWORK_BASH_PATTERNS.some((pattern) =>
    pattern.test(command),
  );
}

/**
 * Tools that stay globally disallowed while plan mode is active. Unlike Write,
 * Edit / MultiEdit / NotebookEdit always target existing source files and
 * never a handoff plan file — so there is no reason to route them through the
 * per-call gate.
 */
const CLAUDE_PLAN_MODE_DISALLOWED_TOOL_NAMES = [
  "Edit",
  "MultiEdit",
  "NotebookEdit",
] as const;

/**
 * Matches `.stave/context/plans/<file>.md` anywhere in a path, so both
 * absolute workspace-rooted paths ("/workspace/.../.stave/context/plans/x.md")
 * and workspace-relative paths (".stave/context/plans/x.md") resolve as
 * handoff plan files.
 */
const CLAUDE_HANDOFF_PLAN_FILE_PATTERN =
  /(?:^|\/)\.stave\/context\/plans\/[^\\/]+\.md$/;

function isHandoffPlanFilePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    CLAUDE_HANDOFF_PLAN_FILE_PATTERN.test(value.trim())
  );
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
    CLAUDE_PLAN_MODE_DISALLOWED_TOOL_NAMES.forEach((toolName) => {
      merged.add(toolName);
    });
  }
  return [...merged];
}

/**
 * Builds the single named worker registered for Worker mode.
 *
 * Returns `undefined` whenever the intent is absent or fails semantic
 * resolution, so an unsupported primary/model combination degrades to the
 * normal solo path rather than silently spawning a different tier.
 *
 * Three guarantees are load-bearing here:
 *
 * - `background` is never set. Stave's turn loop cannot deliver a background
 *   completion notification, and the SDK strips most tools from background
 *   subagents anyway, so the worker must stay foreground.
 * - `permissionMode` mirrors the parent turn, so a plan/read-only turn cannot
 *   gain write capability by delegating.
 * - `effort` is omitted when the resolver reports `null`, because Haiku-class
 *   models reject the field outright.
 */
export function buildClaudeWorkerAgents(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  permissionMode: ClaudePermissionMode;
}): Record<string, AgentDefinition> | undefined {
  const intent = args.runtimeOptions?.workerIntent;
  if (!intent) {
    return undefined;
  }
  const resolution = resolveWorkerProfile({
    providerId: "claude-code",
    primaryModel: args.runtimeOptions?.model ?? "",
    intent,
  });
  if (resolution.status !== "ready") {
    return undefined;
  }
  const { profile } = resolution;
  // `AgentDefinition.effort` has no `ultra` tier, so narrow before assigning.
  const effort = toClaudeWorkerEffort(profile.resolvedWorkerEffort);
  return {
    [profile.workerName]: {
      description: profile.description,
      prompt: profile.instructions,
      model: profile.resolvedWorkerModel,
      ...(effort ? { effort } : {}),
      ...(profile.tools && profile.tools.length > 0
        ? { tools: [...profile.tools] }
        : {}),
      ...(profile.maxTurns !== null ? { maxTurns: profile.maxTurns } : {}),
      // Inherit rather than widen: the worker runs under the parent's policy so
      // approvals and denials keep attributing to the same turn.
      permissionMode: args.permissionMode,
    },
  };
}

export function shouldDenyClaudeToolInPlanMode(args: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  const normalizedToolName = args.toolName.trim().toLowerCase();
  if (CLAUDE_PLAN_MODE_MUTATING_TOOL_NAMES.has(normalizedToolName)) {
    // Write is the one mutating tool we conditionally allow: the handoff
    // convention writes plan files into `.stave/context/plans/**`, and the
    // runtime already treats that directory as session metadata.
    if (
      normalizedToolName === "write" &&
      isHandoffPlanFilePath(args.input.file_path)
    ) {
      return false;
    }
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
  // AskUserQuestion requests information, not permission to perform an action.
  // Keep it interactive even when action approvals are bypassed or denied.
  if (normalizedToolName === "askuserquestion") {
    return "prompt" as const;
  }
  if (CLAUDE_AUTO_ALLOWED_TOOL_NAMES.has(normalizedToolName)) {
    return "allow" as const;
  }
  if (isAlwaysAllowedStaveLocalMcpTool(normalizedToolName)) {
    return "allow" as const;
  }
  if (
    (args.permissionMode === "auto" || args.permissionMode === "dontAsk") &&
    normalizedToolName.startsWith(STAVE_LOCAL_MCP_TOOL_PREFIX)
  ) {
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
  return (
    resolveClaudePermissionModeDecision({
      permissionMode: args.permissionMode ?? "default",
      toolName: args.toolName,
    }) === "allow"
  );
}

export function resolveClaudePlanModeApprovalScope(args: {
  runtimeValue?: ClaudePlanModeApprovalScope;
  envValue?: string;
}): ClaudePlanModeApprovalScope {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate === "strict" ||
    candidate === "bash" ||
    candidate === "bashAndTask" ||
    candidate === "bashTaskAndMcp"
  ) {
    return candidate;
  }
  return DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE;
}

/**
 * Classifies a non-Stave MCP tool (by its leaf name, e.g. `get_file_contents`
 * or `slack_search_public`) as read-only. Returns true only when the name
 * carries a read verb and no write verb, so anything ambiguous (e.g.
 * `lens_navigate`, `create_pull_request`) stays gated behind an approval.
 */
export function isReadOnlyMcpLeafToolName(leafToolName: string): boolean {
  const tokens = leafToolName
    // Split camelCase boundaries ("searchJiraIssues" → "search Jira Issues")
    // before lowercasing so camelCase MCP tool names tokenize like snake_case.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }
  if (tokens.some((token) => CLAUDE_MCP_WRITE_VERB_TOKENS.has(token))) {
    return false;
  }
  return tokens.some((token) => CLAUDE_MCP_READ_VERB_TOKENS.has(token));
}

/**
 * Plan mode is read-only by construction — mutating file tools and mutating
 * Bash are hard-denied before this runs. This decides whether a *non-mutating*
 * tool call should skip the approval prompt based on the user's configured
 * plan-mode approval scope, so planning feels as frictionless as auto mode
 * without ever letting a mutation through.
 */
export function shouldAutoAllowPlanModeScopedTool(args: {
  scope: ClaudePlanModeApprovalScope;
  toolName: string;
  input: Record<string, unknown>;
}): boolean {
  if (args.scope === "strict") {
    return false;
  }
  const normalizedToolName = args.toolName.trim().toLowerCase();

  // Bash: only non-mutating commands. Mutating Bash is hard-denied upstream,
  // but re-check here so the helper is correct in isolation.
  if (normalizedToolName === "bash") {
    const command = extractClaudeBashCommand(args.input);
    return typeof command === "string" && !isMutatingClaudeBashCommand(command);
  }

  // Subagents (Task). The nested subagent's own tool calls still flow through
  // this same canUseTool gate, so mutations remain hard-denied even when the
  // spawn itself is auto-allowed.
  if (normalizedToolName === "task") {
    return args.scope === "bashAndTask" || args.scope === "bashTaskAndMcp";
  }

  // Read-only third-party / lens MCP tools, only at the broadest scope. Stave
  // workspace MCP tools are already auto-allowed earlier, so this targets
  // external servers (github, slack, lens, …).
  if (
    args.scope === "bashTaskAndMcp" &&
    normalizedToolName.startsWith("mcp__")
  ) {
    const leafToolName =
      normalizedToolName.split("__").at(-1) ?? normalizedToolName;
    return isReadOnlyMcpLeafToolName(leafToolName);
  }

  return false;
}

/**
 * Once a plan was presented via ExitPlanMode in a plan-mode turn, every later
 * tool call (except re-presenting an updated plan) must be denied so the agent
 * stops and the turn completes — Stave has already captured the plan for review.
 */
export function shouldDenyClaudePostPlanTool(args: {
  permissionMode: ClaudePermissionMode;
  planPresented: boolean;
  toolName: string;
}): boolean {
  return (
    args.permissionMode === "plan" &&
    args.planPresented &&
    args.toolName.trim().toLowerCase() !== "exitplanmode"
  );
}

function resolveTrustedApprovalInput(args: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  if (args.toolName.trim().toLowerCase() === "bash") {
    return extractClaudeBashCommand(args.input)?.trim() || undefined;
  }
  return undefined;
}

async function resolveEmbeddedStaveLocalMcpServers(options?: {
  unattendedAutomationAuthorizationToken?: string;
}): Promise<Record<string, McpServerConfig> | undefined> {
  const manifest = await readPrimaryStaveLocalMcpManifest();
  if (!manifest) {
    return undefined;
  }
  return {
    [STAVE_LOCAL_MCP_SERVER_NAME]: toClaudeSdkMcpServerConfig(manifest, {
      unattendedAutomationAuthorizationToken:
        options?.unattendedAutomationAuthorizationToken,
    }),
  };
}

function logClaudeMcpConfigDiagnostic(diagnostic: ClaudeMcpConfigDiagnostic) {
  console.warn("[claude-sdk-runtime] skipped Claude MCP configuration", {
    kind: diagnostic.kind,
    source: diagnostic.source,
    ...(diagnostic.serverName ? { serverName: diagnostic.serverName } : {}),
  });
}

async function resolveClaudeMcpServersForQuery(args: {
  cwd: string;
  claudeExecutablePath: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  claudeConfigDir?: string;
  unattendedAutomationAuthorizationToken?: string;
}) {
  const staveServers = await resolveEmbeddedStaveLocalMcpServers({
    unattendedAutomationAuthorizationToken:
      args.unattendedAutomationAuthorizationToken,
  });
  const claudeConfigDir =
    args.claudeConfigDir ??
    buildClaudeEnv({
      executablePath: args.claudeExecutablePath,
      cwd: args.cwd,
    }).CLAUDE_CONFIG_DIR;
  const mcpServers = await resolveClaudeMcpServers({
    cwd: args.cwd,
    claudeConfigDir,
    staveServers,
    strict: args.runtimeOptions?.claudeStrictMcpConfig === true,
    onDiagnostic: logClaudeMcpConfigDiagnostic,
    onStaveOverride: ({ serverName, replacedSource }) => {
      console.warn(
        "[claude-sdk-runtime] Stave MCP server overrides configured server",
        {
          serverName,
          replacedSource,
        },
      );
    },
  });
  return {
    mcpServers,
    hasStaveLocalMcp: Boolean(staveServers),
  };
}

function buildClaudePlanModeDenyMessage(args: { toolName: string }) {
  if (args.toolName.trim().toLowerCase() === "bash") {
    return "Claude plan mode denied a mutating Bash command. Planning turns cannot modify files or task state.";
  }
  return `Claude plan mode denied ${args.toolName}. Planning turns cannot modify files or task state.`;
}

/**
 * Always-on behavioral guardrail injected into every Claude turn.
 *
 * Stave drives the provider one turn at a time and has no persistent loop that can
 * re-invoke the model after a turn ends, so the CLI's "notify you when the background
 * task finishes" pattern is not available here. Without this directive the model
 * routinely ends a turn promising an unprompted follow-up (which never arrives) or
 * leaves a plain-text question that Stave cannot surface an answer control for,
 * stranding the user in a loading/queue-only state.
 *
 * Kept as a module-level constant so it stays byte-stable in the cacheable static
 * prefix of the system prompt.
 */
export const STAVE_TURN_BEHAVIOR_DIRECTIVE = [
  "Stave runtime constraints (read carefully):",
  '- You run inside Stave, which drives you one turn at a time. After a turn ends you CANNOT send an unprompted follow-up message, and there is no channel to autonomously notify the user later. Never promise things like "I\'ll let you know when this finishes" or "I\'ll continue automatically once the background task completes."',
  "- Do not end a turn while expecting to resume on your own. If work must continue, either keep doing it within the current turn or finish with a concrete recommendation the user can act on.",
  "- Background completion notifications (from background subagents, background shell tasks, or workflows) can only reach you while the current turn is still running. Never end a turn waiting to be notified about background work. Stave forces Agent tool calls to run in the foreground (run_in_background: false), so a subagent's result is always returned directly by its tool call — do not narrate plans like \"I'll proceed once the subagent notifies me\".",
  "- If a foreground subagent returns no output or stops before completing its brief, continue that same agent once when its result provides a continuation handle. If it still cannot finish, complete the remaining verification yourself before ending this turn. Never end merely by announcing that the worker stopped.",
  "- To ask a question that must block on the user's decision, use the AskUserQuestion tool so Stave can render a real answer control. A plain-text question at the end of a turn cannot receive an inline answer and will strand the user in a waiting state.",
].join("\n");

/**
 * Rewrite built-in Agent tool inputs so spawned subagents run in the
 * foreground.
 *
 * Recent Claude Code CLIs run Agent-tool subagents in the background by
 * default and tell the model "you will be notified when it completes". That
 * notification can only reach the model while the turn is still streaming —
 * Stave drives the provider one turn at a time and closes the query once
 * `result` arrives, so a turn that ends "waiting for the notification" stalls
 * forever and the subagent's work is lost. Forcing `run_in_background: false`
 * makes the Agent tool call block until the subagent finishes, so its result
 * always lands inside the live turn. Parallel fan-out still works: multiple
 * foreground Agent calls issued in one assistant message execute concurrently.
 *
 * Returns the rewritten input, or undefined when no rewrite is needed.
 */
export function resolveClaudeForegroundSubagentInput(args: {
  toolName: string;
  input: unknown;
}): Record<string, unknown> | undefined {
  if (!isAgentToolName(args.toolName)) {
    return undefined;
  }
  if (
    typeof args.input !== "object" ||
    args.input === null ||
    Array.isArray(args.input)
  ) {
    return undefined;
  }
  const input = args.input as Record<string, unknown>;
  if (input.run_in_background === false) {
    return undefined;
  }
  // Remote isolation always runs in the background at the CLI level; a
  // foreground rewrite would be contradictory, so leave the input untouched.
  if (input.isolation === "remote") {
    return undefined;
  }
  return { ...input, run_in_background: false };
}

/**
 * In-process PreToolUse hook applying the foreground-subagent rewrite above.
 *
 * The hook returns only `updatedInput` — never a `permissionDecision` — so the
 * CLI applies the rewrite and then continues through the normal permission
 * flow (canUseTool, plan-mode gates) for the rewritten call. Registered via
 * `buildClaudeQueryOptions` because the Agent tool is auto-allowed by the CLI
 * and never reaches the canUseTool callback where other input normalization
 * happens.
 */
export const claudeForegroundSubagentPreToolUseHook: HookCallback = async (
  input,
) => {
  if (input.hook_event_name !== "PreToolUse") {
    return {};
  }
  const updatedInput = resolveClaudeForegroundSubagentInput({
    toolName: input.tool_name,
    input: input.tool_input,
  });
  if (!updatedInput) {
    return {};
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput,
    },
  };
};

/**
 * AskUserQuestion is a blocking user interaction, not an action approval.
 * Force it through the host permission callback even when Claude's ordinary
 * action approvals are bypassed.
 */
export const claudeAskUserQuestionPreToolUseHook: HookCallback = async (
  input,
) => {
  if (
    input.hook_event_name !== "PreToolUse" ||
    input.tool_name.trim().toLowerCase() !== "askuserquestion"
  ) {
    return {};
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason:
        "Stave must collect the requested user input before Claude continues.",
    },
  };
};

export function buildClaudeSystemPrompt(args: {
  cwd: string;
  baseSystemPrompt?: string;
  responseStylePrompt?: string;
  /**
   * Primary-facing Worker mode brief. Registering the agent only makes it
   * available; without this the primary has no reason to delegate to it.
   */
  workerInstructions?: string;
}): string[] {
  const workspacePrompt = [
    "Stave workspace context:",
    `Current workspace root: ${args.cwd}`,
    "Resolve every relative filesystem path against the workspace root above.",
    "Do not rewrite a user-provided relative path like ./docs into a sibling directory outside that workspace root.",
    "If the user explicitly asks to access a path outside the workspace root, keep the exact requested path and request approval instead of guessing a nearby absolute path.",
  ].join("\n");

  // Static prefix — eligible for cross-session prompt caching.
  const staticParts: string[] = [STAVE_TURN_BEHAVIOR_DIRECTIVE];
  const baseSystemPrompt = args.baseSystemPrompt?.trim();
  if (baseSystemPrompt) {
    staticParts.push(baseSystemPrompt);
  }
  const responseStyle = args.responseStylePrompt?.trim();
  if (responseStyle) {
    staticParts.push(responseStyle);
  }

  // Dynamic suffix — session-specific, not globally cached. Worker mode belongs
  // here rather than in the cached prefix: it is a per-turn choice, so caching
  // it would leak one turn's execution shape into the next.
  const dynamicParts: string[] = [workspacePrompt];
  const workerInstructions = args.workerInstructions?.trim();
  if (workerInstructions) {
    dynamicParts.push(workerInstructions);
  }

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
  title?: string;
  displayName?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
}) {
  const details: string[] = [];
  if (args.title?.trim()) {
    details.push(args.title.trim());
  }
  if (args.displayName?.trim()) {
    details.push(args.displayName.trim());
  }
  if (args.description?.trim()) {
    details.push(args.description.trim());
  }
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

export function parseClaudeQuestionList(args: {
  input: Record<string, unknown>;
}) {
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
          // Some AskUserQuestion payloads pass options as bare strings.
          if (typeof rawOption === "string") {
            const value = rawOption.trim();
            return value ? [{ label: value, description: value }] : [];
          }
          if (!rawOption || typeof rawOption !== "object") {
            return [];
          }
          const option = rawOption as Record<string, unknown>;
          // Accept `label` (preferred) or `value` as the option label.
          const label =
            typeof option.label === "string" && option.label.trim()
              ? option.label
              : typeof option.value === "string" && option.value.trim()
                ? option.value
                : "";
          if (!label) {
            return [];
          }
          // `description` is optional — fall back to the label so a question is
          // never silently dropped (and the whole prompt suppressed) just
          // because the model omitted per-option descriptions.
          const description =
            typeof option.description === "string" && option.description.trim()
              ? option.description
              : label;
          return [{ label, description }];
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

type ClaudeElicitationFieldDescriptor = {
  key: string;
  kind: "text" | "number" | "integer" | "boolean" | "enum" | "multi_enum";
  optionValueByLabel?: Record<string, string>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseClaudeStringOptions(args: {
  rawOptions: unknown;
  fallbackDescription?: string;
}) {
  if (!Array.isArray(args.rawOptions)) {
    return null;
  }
  const parsed = args.rawOptions.flatMap((option) => {
    if (typeof option === "string" && option.trim()) {
      const value = option.trim();
      return [
        {
          label: value,
          value,
          description: args.fallbackDescription ?? value,
        },
      ];
    }
    if (
      !isPlainRecord(option) ||
      typeof option.const !== "string" ||
      !option.const.trim()
    ) {
      return [];
    }
    const value = option.const.trim();
    return [
      {
        label: toTrimmedString(option.title) ?? value,
        value,
        description: args.fallbackDescription ?? value,
      },
    ];
  });
  return parsed.length > 0 ? parsed : null;
}

function mapDefaultValueToClaudeLabel(args: {
  value: unknown;
  optionValueByLabel: Record<string, string>;
}) {
  if (typeof args.value !== "string") {
    return undefined;
  }
  return Object.entries(args.optionValueByLabel).find(
    ([, optionValue]) => optionValue === args.value,
  )?.[0];
}

function buildClaudeElicitationQuestionFromProperty(args: {
  formMessage: string;
  key: string;
  property: Record<string, unknown>;
  requiredKeys: Set<string>;
}): {
  question: UserInputQuestion;
  field: ClaudeElicitationFieldDescriptor;
} | null {
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
        optionValueByLabel: { Yes: "true", No: "false" },
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
      field: { key: args.key, kind: args.property.type },
    };
  }

  if (args.property.type === "array" && isPlainRecord(args.property.items)) {
    const options = parseClaudeStringOptions({
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
        defaultValue: Array.isArray(args.property.default)
          ? args.property.default
              .map(
                (value) =>
                  mapDefaultValueToClaudeLabel({
                    value,
                    optionValueByLabel,
                  }) ?? (typeof value === "string" ? value : ""),
              )
              .filter(Boolean)
              .join(", ")
          : undefined,
      },
      field: { key: args.key, kind: "multi_enum", optionValueByLabel },
    };
  }

  const scalarOptions = parseClaudeStringOptions({
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
        defaultValue: mapDefaultValueToClaudeLabel({
          value: args.property.default,
          optionValueByLabel,
        }),
      },
      field: { key: args.key, kind: "enum", optionValueByLabel },
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
      field: { key: args.key, kind: "text" },
    };
  }

  return null;
}

/**
 * Permission modes are user-selectable for ordinary chat turns, so only an
 * explicit host-owned unattended automation may auto-accept an elicitation.
 */
export function shouldAutoAcceptClaudeElicitation(args: {
  unattendedAutomation: boolean;
  elicitation: { mode: "url" | "form"; fields: readonly unknown[] };
}): boolean {
  if (!args.unattendedAutomation) {
    return false;
  }
  return (
    args.elicitation.mode === "url" || args.elicitation.fields.length === 0
  );
}

function mapClaudeElicitationToUserInput(
  request: Parameters<OnElicitation>[0],
) {
  const mode = request.mode === "url" ? "url" : "form";
  const message =
    request.message.trim() || "Additional input is required to continue.";

  if (mode === "url") {
    if (!request.url?.trim()) {
      return null;
    }
    return {
      mode,
      questions: [
        {
          key: "__elicitation_url__",
          header: request.title ?? "Claude MCP Elicitation",
          question: message,
          inputType: "url_notice" as const,
          options: [],
          allowCustom: false,
          required: false,
          linkUrl: request.url,
        },
      ],
      fields: [] as ClaudeElicitationFieldDescriptor[],
    };
  }

  const requestedSchema = isPlainRecord(request.requestedSchema)
    ? request.requestedSchema
    : null;
  const properties =
    requestedSchema && isPlainRecord(requestedSchema.properties)
      ? requestedSchema.properties
      : null;

  if (!properties || Object.keys(properties).length === 0) {
    return {
      mode,
      questions: [
        {
          key: "__elicitation_accept__",
          header: request.title ?? "Claude MCP Elicitation",
          question:
            request.description ??
            request.displayName ??
            "Submit to allow this MCP request, or decline to cancel it.",
          inputType: "text" as const,
          options: [],
          allowCustom: false,
          required: false,
        },
      ],
      fields: [] as ClaudeElicitationFieldDescriptor[],
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
    if (!isPlainRecord(property)) {
      return [];
    }
    const question = buildClaudeElicitationQuestionFromProperty({
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

function coerceClaudeElicitationAnswer(args: {
  rawValue: string;
  field: ClaudeElicitationFieldDescriptor;
}) {
  const rawValue = args.rawValue.trim();
  if (args.field.kind === "boolean") {
    const mapped = args.field.optionValueByLabel?.[rawValue] ?? rawValue;
    if (mapped === "true") {
      return true;
    }
    if (mapped === "false") {
      return false;
    }
    return undefined;
  }
  if (args.field.kind === "number" || args.field.kind === "integer") {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return args.field.kind === "integer" ? Math.trunc(parsed) : parsed;
  }
  if (args.field.kind === "enum") {
    return args.field.optionValueByLabel?.[rawValue] ?? rawValue;
  }
  if (args.field.kind === "multi_enum") {
    return rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => args.field.optionValueByLabel?.[entry] ?? entry);
  }
  return rawValue;
}

function mapClaudeUserDialogToUserInput(request: Parameters<OnUserDialog>[0]) {
  if (request.dialogKind !== "refusal_fallback_prompt") {
    return null;
  }
  const title =
    toTrimmedString(request.payload.title) ?? "Claude Fallback Prompt";
  const message =
    toTrimmedString(request.payload.message) ??
    toTrimmedString(request.payload.description) ??
    "Claude needs a fallback prompt to continue.";
  const defaultValue =
    toTrimmedString(request.payload.prompt) ??
    toTrimmedString(request.payload.defaultPrompt);
  return {
    answerKey: "prompt",
    questions: [
      {
        key: "prompt",
        header: title,
        question: message,
        inputType: "text" as const,
        options: [],
        allowCustom: true,
        required: true,
        placeholder: "Fallback prompt",
        defaultValue,
      },
    ],
  };
}

export class ClaudeToolDecisionTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Claude tool permission request timed out after ${timeoutMs}ms.`);
    this.name = "ClaudeToolDecisionTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export const CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS = 45 * 60 * 1000;

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

function resolveClaudeFallbackModel(args: {
  model?: string;
  fallbackModel?: string;
}) {
  const model = args.model?.trim();
  const fallbackModels = (args.fallbackModel ?? "")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(
      (candidate, index, entries) =>
        candidate.length > 0 &&
        candidate !== model &&
        entries.indexOf(candidate) === index,
    );
  return fallbackModels.length > 0 ? fallbackModels.join(",") : undefined;
}

function resolveClaudePluginConfigs(value?: readonly string[]) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const plugins = value
    .map((pluginPath) => pluginPath.trim())
    .filter(
      (pluginPath, index, entries) =>
        pluginPath.length > 0 && entries.indexOf(pluginPath) === index,
    )
    .map((pluginPath) => ({
      type: "local" as const,
      path: pluginPath,
      skipMcpDiscovery: true,
    }));
  return plugins.length > 0 ? plugins : undefined;
}

export function buildClaudeQueryOptions(args: {
  cwd: string;
  claudeExecutablePath: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  permissionMode?: ClaudePermissionMode;
  resume?: string;
  systemPrompt?: string | string[];
  includePartialMessages?: boolean;
  promptSuggestions?: boolean;
  /**
   * Set only by the conversation turn. Gates Worker-mode agent registration so
   * utility and control queries sharing these runtime options never spend one.
   */
  workerModeEligible?: boolean;
  canUseTool?: CanUseTool;
  mcpServers?: Record<string, McpServerConfig>;
  onElicitation?: OnElicitation;
  onUserDialog?: OnUserDialog;
  secondaryReadOnly?: boolean;
  providerBrowserRequested?: boolean;
  /**
   * Env vars for bound vault secrets, resolved in the main process. Spread into
   * the SDK subprocess env so the agent's Bash tool can read them. Passed only
   * for the primary user turn — never for introspection or aux queries — which
   * keeps secrets out of diagnostics and analysis subprocesses by construction.
   */
  secretEnv?: Record<string, string>;
}): Options {
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
  const credentialFiles = Array.from(
    new Set(
      (args.runtimeOptions?.claudeSandboxCredentialFiles ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
  const credentialEnvVars = Array.from(
    new Set(
      (args.runtimeOptions?.claudeSandboxCredentialEnvVars ?? [])
        .map((entry) => entry.trim())
        .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry)),
    ),
  );
  const sandboxCredentials =
    credentialFiles.length > 0 || credentialEnvVars.length > 0
      ? {
          ...(credentialFiles.length > 0
            ? {
                files: credentialFiles.map((credentialPath) => ({
                  path: credentialPath,
                  mode: "deny" as const,
                })),
              }
            : {}),
          ...(credentialEnvVars.length > 0
            ? {
                envVars: credentialEnvVars.map((name) => ({
                  name,
                  mode: "deny" as const,
                })),
              }
            : {}),
        }
      : undefined;
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
  const pluginConfigs = resolveClaudePluginConfigs(
    args.runtimeOptions?.claudePluginPaths,
  );
  // Opt-in rather than inferred. Most callers of this builder are utility and
  // control queries (command catalog, context usage, plugin reload, MCP
  // control) which share the caller's runtime options but must never spend a
  // worker; only the conversation turn sets `workerModeEligible`. Secondary
  // read-only turns stay excluded even when they ask, since a worker would be a
  // second write-capable actor inside a turn that exists only to observe.
  const workerAgents =
    args.workerModeEligible && !args.secondaryReadOnly
      ? buildClaudeWorkerAgents({
          runtimeOptions: args.runtimeOptions,
          permissionMode,
        })
      : undefined;
  const fallbackModel = resolveClaudeFallbackModel({
    model: args.runtimeOptions?.model,
    fallbackModel: args.runtimeOptions?.claudeFallbackModel,
  });
  const settings = args.secondaryReadOnly
    ? {
        ...(args.runtimeOptions?.claudeFastMode ? { fastMode: true } : {}),
        permissions: {
          deny: [
            "Edit(*)",
            "Write(*)",
            "NotebookEdit(*)",
            "WebFetch(*)",
            "WebSearch",
          ],
        },
      }
    : args.runtimeOptions?.claudeFastMode
      ? { fastMode: true }
      : undefined;
  const sandbox = args.secondaryReadOnly
    ? {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        network: {
          deniedDomains: ["*"],
          allowAllUnixSockets: false,
          allowLocalBinding: false,
        },
        filesystem: {
          denyWrite: [path.parse(args.cwd).root],
        },
        ...(sandboxCredentials ? { credentials: sandboxCredentials } : {}),
      }
    : {
        enabled: claudeSandboxEnabled,
        allowUnsandboxedCommands: claudeAllowUnsandboxedCommands,
        ...(sandboxCredentials ? { credentials: sandboxCredentials } : {}),
      };

  return {
    permissionMode,
    ...(permissionMode === "bypassPermissions"
      ? { allowDangerouslySkipPermissions }
      : {}),
    ...(args.resume ? { resume: args.resume } : {}),
    ...(args.includePartialMessages ? { includePartialMessages: true } : {}),
    promptSuggestions:
      args.runtimeOptions?.claudePromptSuggestions ??
      args.promptSuggestions ??
      false,
    cwd: args.cwd,
    extraArgs: args.providerBrowserRequested
      ? { chrome: null }
      : { "no-chrome": null },
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    ...(fallbackModel ? { fallbackModel } : {}),
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
    ...(typeof args.runtimeOptions?.claudeForwardSubagentText === "boolean"
      ? { forwardSubagentText: args.runtimeOptions.claudeForwardSubagentText }
      : {}),
    ...(typeof args.runtimeOptions?.claudeEnableFileCheckpointing === "boolean"
      ? {
          enableFileCheckpointing:
            args.runtimeOptions.claudeEnableFileCheckpointing,
        }
      : {}),
    ...(args.resume && args.runtimeOptions?.claudeForkSession
      ? { forkSession: true }
      : {}),
    ...(args.resume && args.runtimeOptions?.claudeResumeSessionAt
      ? { resumeSessionAt: args.runtimeOptions.claudeResumeSessionAt }
      : {}),
    ...(typeof args.runtimeOptions?.claudeStrictMcpConfig === "boolean"
      ? { strictMcpConfig: args.runtimeOptions.claudeStrictMcpConfig }
      : {}),
    ...(args.runtimeOptions?.claudeAllowedTools
      ? { allowedTools: args.runtimeOptions.claudeAllowedTools }
      : {}),
    ...(disallowedTools.length > 0 ? { disallowedTools } : {}),
    ...(args.runtimeOptions?.claudeSkills
      ? { skills: args.runtimeOptions.claudeSkills }
      : {}),
    ...(pluginConfigs ? { plugins: pluginConfigs } : {}),
    ...(args.runtimeOptions?.claudeAgentName
      ? { agent: args.runtimeOptions.claudeAgentName }
      : {}),
    // Registers the Worker-mode task executor. Deliberately `agents` (available
    // to delegate to) and not `agent` (replaces the main loop) — the primary has
    // to stay in charge of planning and integration.
    ...(workerAgents ? { agents: workerAgents } : {}),
    ...(settingSources !== undefined ? { settingSources } : {}),
    ...(args.runtimeOptions?.claudeFastMode
      ? { settings: { fastMode: true } }
      : {}),
    // Always-on: force Agent-tool subagents to run in the foreground so a
    // turn can never end waiting for a background-completion notification
    // that Stave's one-turn-at-a-time loop cannot deliver.
    hooks: {
      PreToolUse: [
        {
          matcher: "^AskUserQuestion$",
          hooks: [claudeAskUserQuestionPreToolUseHook],
        },
        {
          matcher: "^Agent$",
          hooks: [claudeForegroundSubagentPreToolUseHook],
        },
      ],
    },
    ...(args.canUseTool ? { canUseTool: args.canUseTool } : {}),
    ...(!args.secondaryReadOnly && args.onElicitation
      ? { onElicitation: args.onElicitation }
      : {}),
    ...(!args.secondaryReadOnly && args.onUserDialog
      ? {
          onUserDialog: args.onUserDialog,
          supportedDialogKinds: ["refusal_fallback_prompt"],
        }
      : {}),
    ...(args.mcpServers ? { mcpServers: args.mcpServers } : {}),
    ...(args.secondaryReadOnly
      ? {
          persistSession: false,
          plugins: [],
        }
      : {}),
    ...(settings ? { settings } : {}),
    sandbox,
    // Runtime-owned env is spread last so a bound secret can never override a
    // Stave runtime var. The resolver's reserved-key denylist remains the
    // primary guard; this ordering is defence in depth.
    env: {
      ...(args.secretEnv ?? {}),
      ...buildClaudeEnv({
        executablePath: args.claudeExecutablePath,
        cwd: args.cwd,
      }),
    },
    ...(args.claudeExecutablePath.length > 0
      ? { pathToClaudeCodeExecutable: args.claudeExecutablePath }
      : {}),
  };
}

type ClaudeMcpRecentError = {
  message: string;
  occurredAt: number;
};

const claudeMcpRecentErrorByServer = new Map<string, ClaudeMcpRecentError>();

function toClaudeMcpRecentErrorKey(args: {
  scopeKey: string;
  serverName: string;
}) {
  return `${args.scopeKey}\u0000${args.serverName}`;
}

function rememberClaudeMcpError(args: {
  scopeKey: string;
  serverName: string;
  error: string;
}) {
  const message = sanitizeTextField({
    value: sanitizeMcpDiagnosticText(args.error),
    label: "Claude MCP error",
    maxChars: 2_000,
  });
  if (!message) {
    return;
  }
  claudeMcpRecentErrorByServer.set(toClaudeMcpRecentErrorKey(args), {
    message,
    occurredAt: Date.now(),
  });
}

function toClaudeMcpServerStatusSnapshot(
  status: McpServerStatus,
  options?: { scopeKey?: string; checkedAt?: number },
): ClaudeMcpServerStatusSnapshot {
  const error = status.error
    ? sanitizeTextField({
        value: sanitizeMcpDiagnosticText(status.error),
        label: "Claude MCP error",
        maxChars: 2_000,
      })
    : undefined;
  if (options?.scopeKey && error) {
    rememberClaudeMcpError({
      scopeKey: options.scopeKey,
      serverName: status.name,
      error,
    });
  }
  const recentError = options?.scopeKey
    ? claudeMcpRecentErrorByServer.get(
        toClaudeMcpRecentErrorKey({
          scopeKey: options.scopeKey,
          serverName: status.name,
        }),
      )
    : undefined;

  return {
    name: status.name,
    status: status.status,
    ...(error ? { error } : {}),
    ...(recentError
      ? {
          lastError: recentError.message,
          lastErrorAt: recentError.occurredAt,
        }
      : {}),
    ...(options?.checkedAt ? { statusUpdatedAt: options.checkedAt } : {}),
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
// Correlates task_progress SDK messages with their originating subagent
// tool_use_id using hook metadata (agent_id) when available, falling back to
// the most recent active built-in Agent or legacy Task tool call.

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

function isClaudeSubagentToolName(name: string): boolean {
  const normalizedToolName = name.trim().toLowerCase();
  return normalizedToolName === "agent" || normalizedToolName === "task";
}

/**
 * How a task_progress message was matched to a subagent tool call.
 *
 * `positional_fallback` is a heuristic guess, not an identity: consumers must
 * not promote it into an id the provider never reported.
 */
export type SubagentProgressResolvedBy =
  | "tool_use_id"
  | "agent_id"
  | "positional_fallback"
  | "unresolved";

export type SubagentProgressResolution = {
  /** Subagent tool_use_id the progress belongs to, when one could be found. */
  toolUseId?: string;
  /**
   * Identity of the subagent this progress is *about*, taken verbatim from the
   * message's `task_id`. Directly reported by the provider, so it survives even
   * a positional-fallback tool_use_id match.
   */
  agentId?: string;
  /**
   * Identity of the subagent the correlated tool call ran *inside*, from hook
   * metadata. Points up, not down. Never set from a positional-fallback match,
   * because attaching hook identity to a guessed tool_use_id would invent an
   * association the provider never reported.
   */
  ownerAgentId?: string;
  resolvedBy: SubagentProgressResolvedBy;
};

export class SubagentProgressTracker {
  /**
   * Hook `agent_id` → toolUseId. Claude's hook `agent_id` names the subagent a
   * tool call ran *inside*, so this is an owner relationship, not a spawn one.
   */
  private readonly agentIdToToolUseId = new Map<string, string>();
  /** Reverse of `agentIdToToolUseId`: toolUseId → owning hook `agent_id`. */
  private readonly toolUseIdToAgentId = new Map<string, string>();
  /** Ordered list of subagent tool_use_ids that have not received a result. */
  private readonly pendingSubagentToolUseIds: string[] = [];

  /**
   * Call for every BridgeEvent that is about to be emitted so the tracker can
   * record built-in Agent and legacy Task tool starts and completions.
   */
  trackEvent(event: BridgeEvent): void {
    if (
      event.type === "tool" &&
      isClaudeSubagentToolName(event.toolName) &&
      event.toolUseId
    ) {
      if (!this.pendingSubagentToolUseIds.includes(event.toolUseId)) {
        this.pendingSubagentToolUseIds.push(event.toolUseId);
      }
    }
    if (event.type === "tool_result") {
      for (
        let index = this.pendingSubagentToolUseIds.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (this.pendingSubagentToolUseIds[index] === event.tool_use_id) {
          this.pendingSubagentToolUseIds.splice(index, 1);
        }
      }
      for (const [agentId, toolUseId] of this.agentIdToToolUseId) {
        if (toolUseId === event.tool_use_id) {
          this.forgetAgentId(agentId);
        }
      }
      this.toolUseIdToAgentId.delete(event.tool_use_id);
    }
  }

  /** Drop both directions of an agent_id association. */
  private forgetAgentId(agentId: string): void {
    const toolUseId = this.agentIdToToolUseId.get(agentId);
    this.agentIdToToolUseId.delete(agentId);
    if (toolUseId && this.toolUseIdToAgentId.get(toolUseId) === agentId) {
      this.toolUseIdToAgentId.delete(toolUseId);
    }
  }

  /**
   * Extract agent_id / tool_use_id from hook-related SDK messages and persist
   * the mapping so future task_progress events can be resolved.
   */
  processRawMessage(message: Record<string, unknown>): void {
    const type = message.subtype ?? message.type;
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
      this.toolUseIdToAgentId.set(toolUseId, agentId);
    }
  }

  /**
   * Reverse of the hook mapping: which subagent did hook metadata say this tool
   * call ran *inside*. This is an `ownerAgentId` — it points up at the worker
   * that emitted the call, never down at a worker the call spawned. Returns
   * undefined when nothing named it; callers must not substitute a guess.
   */
  resolveOwnerAgentId(toolUseId: string | undefined): string | undefined {
    if (!toolUseId) {
      return undefined;
    }
    return this.toolUseIdToAgentId.get(toolUseId);
  }

  /**
   * Given a raw task_progress SDK message, determine which subagent tool_use_id
   * the progress belongs to, and how confidently.
   *
   * Resolution order:
   *  1. Direct `tool_use_id` field on the progress message
   *  2. `agent_id` field mapped through hook metadata
   *  3. Most recently started active Agent or Task (positional heuristic)
   *
   * `agentId` comes from the message's own `task_id` and is independent of that
   * order: it is directly reported, so it stands even behind a positional
   * match. `ownerAgentId` is hook-derived and only accompanies 1 and 2, because
   * the positional heuristic is a guess and must not be laundered into an
   * identity.
   */
  resolveProgress(
    progressMessage: Record<string, unknown>,
  ): SubagentProgressResolution {
    const directToolUseId = extractStringField(progressMessage, "tool_use_id");
    const messageAgentId = extractStringField(progressMessage, "agent_id");
    // SDKTaskProgressMessage.task_id: the subagent the progress reports on.
    const taskAgentId = extractStringField(progressMessage, "task_id");
    const about = taskAgentId ? { agentId: taskAgentId } : {};
    if (
      directToolUseId &&
      this.pendingSubagentToolUseIds.includes(directToolUseId)
    ) {
      const ownerAgentId =
        messageAgentId ?? this.toolUseIdToAgentId.get(directToolUseId);
      return {
        toolUseId: directToolUseId,
        ...about,
        ...(ownerAgentId ? { ownerAgentId } : {}),
        resolvedBy: "tool_use_id",
      };
    }

    if (messageAgentId) {
      const mapped = this.agentIdToToolUseId.get(messageAgentId);
      if (mapped && this.pendingSubagentToolUseIds.includes(mapped)) {
        return {
          toolUseId: mapped,
          ...about,
          ownerAgentId: messageAgentId,
          resolvedBy: "agent_id",
        };
      }
      this.forgetAgentId(messageAgentId);
    }

    // Fallback: last pending Agent or legacy Task tool_use_id. Positional, so
    // it never yields an ownerAgentId.
    const fallbackToolUseId = this.pendingSubagentToolUseIds.at(-1);
    return fallbackToolUseId
      ? {
          toolUseId: fallbackToolUseId,
          ...about,
          resolvedBy: "positional_fallback",
        }
      : { ...about, resolvedBy: "unresolved" };
  }

  /**
   * Backwards-compatible accessor: the resolved tool_use_id only, with the same
   * precedence as `resolveProgress`.
   */
  resolveToolUseId(
    progressMessage: Record<string, unknown>,
  ): string | undefined {
    return this.resolveProgress(progressMessage).toolUseId;
  }
}

/**
 * Build the normalized `subagent_progress` event for a resolved task_progress
 * message. Each id is carried only when the provider actually reported it:
 * `agentId` from the message's `task_id`, `ownerAgentId` from hook metadata for
 * a non-guessed tool_use_id match.
 *
 * The resolution's confidence crosses the event boundary as `binding`, because
 * withholding `ownerAgentId` alone is not enough: a positional-fallback
 * `toolUseId` emitted next to the message's real `task_id` still reads
 * downstream as "this call spawned this agent", and the work graph would bind
 * the guess permanently. `binding: "guess"` lets consumers route the text
 * without ever treating the correlation as identity.
 */
export function buildClaudeSubagentProgressEvent(args: {
  summary: string;
  resolution: SubagentProgressResolution;
}): BridgeEvent {
  return {
    type: "subagent_progress",
    toolUseId: args.resolution.toolUseId,
    content: args.summary,
    ...(args.resolution.agentId ? { agentId: args.resolution.agentId } : {}),
    ...(args.resolution.ownerAgentId
      ? { ownerAgentId: args.resolution.ownerAgentId }
      : {}),
    ...(args.resolution.toolUseId
      ? {
          binding:
            args.resolution.resolvedBy === "positional_fallback"
              ? ("guess" as const)
              : ("authoritative" as const),
        }
      : {}),
  };
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

  if (
    streamEvent.type === "message_start" ||
    streamEvent.type === "message_stop"
  ) {
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
      index == null ||
      !contentBlock ||
      contentBlock.type !== "tool_use" ||
      contentBlock.name !== "ExitPlanMode"
    ) {
      return [];
    }

    const sourceSegmentId =
      extractClaudeToolUseId(contentBlock.id) ??
      buildClaudeFallbackPlanSegmentId(index);
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
      ? [
          buildClaudePlanReadyEvent({
            planText: initialPlanText,
            sourceSegmentId,
          }),
        ]
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

    const partialJson =
      typeof delta.partial_json === "string" ? delta.partial_json : "";
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

/**
 * Minimal view of `SubagentProgressTracker` needed while mapping tool_use
 * blocks, so the mapper stays a pure function of its inputs. Deliberately named
 * for the *owner* direction: Claude reports which subagent a tool call ran
 * inside, never which subagent a spawn call produced.
 */
export type ClaudeOwnerAgentIdResolver = {
  resolveOwnerAgentId(toolUseId: string | undefined): string | undefined;
};

export function mapClaudeMessageToEvents(args: {
  message: SDKMessage;
  claudeDebugStream: boolean;
  cwd?: string;
  planState?: ClaudePlanStreamState;
  ownerAgentIdResolver?: ClaudeOwnerAgentIdResolver;
  providerBrowserRequested?: boolean;
}): BridgeEvent[] {
  const { message, claudeDebugStream } = args;

  if (message.type === "system") {
    const sysMsg = message as SDKSystemMessage & {
      subtype?: string;
      content?: string;
      summary?: string;
    };
    if (sysMsg.subtype === "permission_denied") {
      const denied = message as SDKPermissionDeniedMessage;
      return [
        {
          type: "permission_denial",
          toolName: denied.tool_name,
          message: denied.message,
          ...(denied.decision_reason_type
            ? { reasonType: denied.decision_reason_type }
            : {}),
          ...(denied.decision_reason ? { reason: denied.decision_reason } : {}),
        },
      ];
    }
    if (sysMsg.subtype === "hook_started") {
      const hook = message as SDKHookStartedMessage;
      return [
        {
          type: "hook_activity",
          hookId: hook.hook_id,
          hookName: hook.hook_name,
          hookEvent: hook.hook_event,
          status: "running",
        },
      ];
    }
    if (sysMsg.subtype === "hook_progress") {
      const hook = message as SDKHookProgressMessage;
      return [
        {
          type: "hook_activity",
          hookId: hook.hook_id,
          hookName: hook.hook_name,
          hookEvent: hook.hook_event,
          status: "running",
        },
      ];
    }
    if (sysMsg.subtype === "hook_response") {
      const hook = message as SDKHookResponseMessage;
      return [
        {
          type: "hook_activity",
          hookId: hook.hook_id,
          hookName: hook.hook_name,
          hookEvent: hook.hook_event,
          status:
            hook.outcome === "success"
              ? "completed"
              : hook.outcome === "cancelled"
                ? "cancelled"
                : "failed",
        },
      ];
    }
    if (sysMsg.subtype === "informational") {
      const informational = message as SDKInformationalMessage;
      if (informational.prevent_continuation && informational.content.trim()) {
        return [
          {
            type: "hook_activity",
            hookId: `hook-feedback:${informational.uuid}`,
            hookName: "Hook feedback",
            hookEvent: "unknown",
            status: "blocked",
          },
          { type: "system", content: informational.content },
        ];
      }
    }
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
      const events: BridgeEvent[] = [
        {
          type: "provider_session",
          providerId: "claude-code",
          nativeSessionId: sysMsg.session_id,
        },
      ];
      if (args.providerBrowserRequested) {
        const chromeServer = sysMsg.mcp_servers?.find(
          (server) => server.name.trim().toLowerCase() === "claude-in-chrome",
        );
        events.push({
          type: "browser_connection",
          providerId: "claude-code",
          status:
            chromeServer?.status.trim().toLowerCase() === "connected"
              ? "connected"
              : "failed",
          at: Date.now(),
        });
      }
      return events;
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
        return [{ type: "system", content: "Sending request to model\u2026" }];
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
    const historyEvents: BridgeEvent[] =
      assistantMsg.parent_tool_use_id === null && assistantMsg.uuid
        ? [
            {
              type: "history_boundary",
              providerId: "claude-code",
              boundaryKind: "message",
              nativeId: assistantMsg.uuid,
              targetRole: "assistant",
            },
          ]
        : [];

    if (assistantMsg.error) {
      if (assistantMsg.error === "authentication_failed") {
        return [
          ...historyEvents,
          {
            type: "error",
            message:
              "Claude authentication failed. Run `claude auth login` and retry.",
            recoverable: true,
          },
        ];
      }
      if (assistantMsg.error === "billing_error") {
        return [
          ...historyEvents,
          {
            type: "error",
            message:
              "Claude billing/subscription issue detected. Check plan/payment status and retry.",
            recoverable: true,
          },
        ];
      }
    }

    const nativeSessionId =
      typeof assistantMsg.session_id === "string"
        ? assistantMsg.session_id.trim()
        : "";
    const nativeTurnId =
      typeof assistantMsg.uuid === "string" ? assistantMsg.uuid.trim() : "";
    const events: BridgeEvent[] =
      nativeSessionId && nativeTurnId
        ? [
            {
              type: "provider_turn",
              providerId: "claude-code",
              nativeSessionId,
              nativeTurnId,
            },
          ]
        : [];

    // Nesting is reported once per message, not per content block: every
    // tool_use in this message ran inside the same parent tool call.
    const parentToolUseId = extractClaudeToolUseId(
      assistantMsg.parent_tool_use_id,
    );

    // content is on the nested BetaMessage, not at the top level
    const contentBlocks = assistantMsg.message?.content;
    if (!Array.isArray(contentBlocks)) {
      return [...historyEvents, ...events];
    }

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
          events.push(
            buildClaudePlanReadyEvent({
              planText,
              sourceSegmentId: toolUseId,
            }),
          );
          continue;
        }
        // No `agentId` here: when an Agent/Task spawn call is emitted the
        // child's task_id does not exist yet, and guessing one would invert a
        // graph edge. The reducer binds the spawn call to its worker later,
        // from a task_progress carrying both toolUseId and task_id.
        const ownerAgentId =
          args.ownerAgentIdResolver?.resolveOwnerAgentId(toolUseId);
        events.push({
          type: "tool",
          ...(toolUseId ? { toolUseId } : {}),
          toolName: b.name ?? "tool_use",
          input: toText(b.input ?? {}),
          state: "input-available",
          ...(ownerAgentId ? { ownerAgentId } : {}),
          ...(parentToolUseId ? { parentToolUseId } : {}),
        });
        continue;
      }
    }
    return [...historyEvents, ...events];
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
      parent_tool_use_id?: string | null;
      isSynthetic?: boolean;
      origin?: { kind?: string };
      uuid?: string;
    };
    const userContent = userMsg.message?.content;
    const containsToolResult =
      Array.isArray(userContent) &&
      userContent.some(
        (block) =>
          Boolean(block) &&
          typeof block === "object" &&
          (block as { type?: string }).type === "tool_result",
      );
    const historyEvents: BridgeEvent[] =
      message.type === "user" &&
      typeof userMsg.uuid === "string" &&
      userMsg.uuid.length > 0 &&
      userMsg.parent_tool_use_id == null &&
      userMsg.isSynthetic !== true &&
      (!userMsg.origin || userMsg.origin.kind === "human") &&
      !containsToolResult
        ? [
            {
              type: "history_boundary",
              providerId: "claude-code",
              boundaryKind: "message",
              nativeId: userMsg.uuid,
              targetRole: "user",
            },
          ]
        : [];
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
      return [...historyEvents, ...toolResultEvents];
    }
    return historyEvents;
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
      events.unshift({
        type: "error",
        message:
          typeof errorText === "string" && errorText.trim().length > 0
            ? errorText
            : "Claude turn failed.",
        recoverable: true,
      });
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
    message.type === "session_state_changed"
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

export function attachClaudeWorkerExecutionMetadata(args: {
  events: BridgeEvent[];
  profile: ResolvedWorkerProfile | null;
}): BridgeEvent[] {
  const profile = args.profile;
  if (!profile) return args.events;
  const workerExecution = buildWorkerExecutionMetadata(profile);
  return args.events.map((event) => {
    if (event.type !== "tool" || !["agent", "task"].includes(event.toolName.toLowerCase())) {
      return event;
    }
    try {
      const input = JSON.parse(event.input) as Record<string, unknown>;
      const subagentType = input.subagent_type ?? input.subagentType;
      return subagentType === profile.workerName
        ? { ...event, workerExecution }
        : event;
    } catch {
      return event;
    }
  });
}

export function resolveClaudeTurnStopReason(args: {
  message: SDKMessage;
  currentStopReason?: string;
}): string | undefined {
  if (args.message.type === "result") {
    const result = args.message as SDKResultMessage;
    return (
      result.stop_reason ??
      (result.is_error ? "runtime_failure" : args.currentStopReason)
    );
  }

  if (args.message.type === "assistant") {
    const error = (args.message as SDKAssistantMessage).error;
    if (error === "authentication_failed" || error === "billing_error") {
      return "runtime_failure";
    }
  }

  if (args.message.type === "error") {
    return "runtime_failure";
  }

  return args.currentStopReason;
}

export function resolveClaudeStreamTerminalStopReason(args: {
  abortRequested: boolean;
  currentStopReason?: string;
}): string | undefined {
  return args.abortRequested ? "user_abort" : args.currentStopReason;
}

export function buildClaudeReadOnlyPromptOptions(args: {
  cwd: string;
  model: string;
  effort?: NonNullable<
    NonNullable<StreamTurnArgs["runtimeOptions"]>["claudeEffort"]
  >;
  abortController: AbortController;
  claudeExecutablePath: string;
}): Options {
  return {
    abortController: args.abortController,
    cwd: args.cwd,
    model: args.model,
    ...(args.effort ? { effort: args.effort } : {}),
    maxTurns: 1,
    permissionMode: "dontAsk",
    tools: [],
    allowedTools: [],
    skills: [],
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: false,
    },
    env: buildClaudeEnv({
      executablePath: args.claudeExecutablePath,
      cwd: args.cwd,
    }),
    ...(args.claudeExecutablePath
      ? { pathToClaudeCodeExecutable: args.claudeExecutablePath }
      : {}),
  };
}

export type ClaudeReadOnlyPromptProgress = {
  stage: "loading_runtime" | "waiting_for_result";
  lastMessageType?: string;
};

type ClaudeReadOnlyPromptResult = {
  ok: boolean;
  text?: string;
  usage?: Extract<BridgeEvent, { type: "usage" }>;
  aborted?: boolean;
  detail?: string;
};

/**
 * Consumes the real SDK async iterator without treating an intermediate
 * assistant message as complete advice. Keeping this loop independently
 * testable covers delayed final results while exposing content-free progress
 * metadata to timeout diagnostics.
 */
export async function consumeClaudeReadOnlyPromptStream(args: {
  stream: AsyncIterable<SDKMessage>;
  label: string;
  onProgress?: (progress: ClaudeReadOnlyPromptProgress) => void;
}): Promise<ClaudeReadOnlyPromptResult> {
  for await (const message of args.stream) {
    args.onProgress?.({
      stage: "waiting_for_result",
      lastMessageType: message.type,
    });
    if (message.type !== "result") {
      continue;
    }
    const result = message as SDKResultMessage;
    const usage = buildClaudeUsageEvent(result) as Extract<
      BridgeEvent,
      { type: "usage" }
    >;
    if (result.subtype !== "success" || result.is_error) {
      return {
        ok: false,
        usage,
        detail:
          result.subtype === "success"
            ? `Claude ${args.label} returned an error result.`
            : result.errors.join("\n") ||
              `Claude ${args.label} failed during execution.`,
      };
    }
    return {
      ok: true,
      text: result.result,
      usage,
    };
  }
  return {
    ok: false,
    detail: `Claude ${args.label} ended without a result.`,
  };
}

export async function runClaudeReadOnlyPrompt(args: {
  cwd?: string;
  prompt: string;
  model: string;
  effort?: NonNullable<
    NonNullable<StreamTurnArgs["runtimeOptions"]>["claudeEffort"]
  >;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  signal?: AbortSignal;
  /**
   * Caller-facing name used in failure text. This helper is shared by the
   * Advisor, commit-message generation, task naming, and route classification,
   * so hardcoding "Advisor" leaked advisor wording into unrelated toasts.
   */
  label?: string;
  /** Provider-safe progress metadata used by bounded callers for diagnostics. */
  onProgress?: (progress: ClaudeReadOnlyPromptProgress) => void;
}): Promise<ClaudeReadOnlyPromptResult> {
  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const label = args.label?.trim() || DEFAULT_READ_ONLY_PROMPT_LABEL;
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  if (args.signal?.aborted) {
    return { ok: false, aborted: true, detail: `${label} was aborted.` };
  }
  args.signal?.addEventListener("abort", abort, { once: true });

  let stream: Query | null = null;
  try {
    args.onProgress?.({ stage: "loading_runtime" });
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;
    if (!queryFn) {
      return {
        ok: false,
        detail: "Claude SDK query() is unavailable.",
      };
    }

    const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
      runtimeOptions: args.runtimeOptions,
    });
    const options = buildClaudeReadOnlyPromptOptions({
      abortController,
      cwd: runtimeCwd,
      model: args.model,
      effort: args.effort,
      claudeExecutablePath,
    });
    stream = queryFn({ prompt: args.prompt, options }) as Query;
    args.onProgress?.({ stage: "waiting_for_result" });

    return consumeClaudeReadOnlyPromptStream({
      stream,
      label,
      onProgress: args.onProgress,
    });
  } catch (error) {
    if (
      abortController.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }
    return {
      ok: false,
      detail: `Claude ${label} failed: ${toText(error)}`,
    };
  } finally {
    args.signal?.removeEventListener("abort", abort);
    stream?.close();
  }
}

export async function forkClaudeSession(args: {
  sessionId: string;
  upToMessageId: string;
  title?: string;
  cwd?: string;
}): Promise<ClaudeSessionForkResponse> {
  try {
    const mod = await getPrewarmedSdkModule();
    if (!mod.forkSession) {
      return {
        ok: false,
        detail: "Claude SDK forkSession() is unavailable.",
      };
    }

    const dir = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : undefined;
    const sourceMessages = mod.getSessionMessages
      ? await mod
          .getSessionMessages(args.sessionId, {
            ...(dir ? { dir } : {}),
          })
          .catch(() => [])
      : [];
    const result = await mod.forkSession(args.sessionId, {
      ...(dir ? { dir } : {}),
      upToMessageId: args.upToMessageId,
      ...(args.title?.trim() ? { title: args.title.trim() } : {}),
    });
    const forkedMessages = mod.getSessionMessages
      ? await mod
          .getSessionMessages(result.sessionId, {
            ...(dir ? { dir } : {}),
          })
          .catch(() => [])
      : [];
    const targetIndex = sourceMessages.findIndex(
      (message) => message.uuid === args.upToMessageId,
    );
    const sourceThroughTarget =
      targetIndex >= 0 ? sourceMessages.slice(0, targetIndex + 1) : [];
    const messageIdMap = Object.fromEntries(
      sourceThroughTarget.flatMap((message, index) => {
        const forkedMessage = forkedMessages[index];
        return forkedMessage &&
          message.type === "assistant" &&
          forkedMessage.type === message.type
          ? [[message.uuid, forkedMessage.uuid] as const]
          : [];
      }),
    );
    const lastAssistantMessageId = forkedMessages
      .filter((message) => message.type === "assistant")
      .at(-1)?.uuid;

    return {
      ok: true,
      detail: "Forked Claude session.",
      sessionId: result.sessionId,
      ...(lastAssistantMessageId ? { lastAssistantMessageId } : {}),
      ...(Object.keys(messageIdMap).length > 0 ? { messageIdMap } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude session fork failed: ${toText(error)}`,
    };
  }
}

export async function renameClaudeSession(args: {
  sessionId: string;
  title: string;
  cwd?: string;
}): Promise<ProviderMutationResponse> {
  try {
    const mod = await getPrewarmedSdkModule();
    if (!mod.renameSession) {
      return {
        ok: false,
        detail: "Claude SDK renameSession() is unavailable.",
      };
    }
    const dir = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : undefined;
    await mod.renameSession(args.sessionId, args.title, {
      ...(dir ? { dir } : {}),
    });
    return {
      ok: true,
      detail: "Renamed Claude session.",
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude session rename failed: ${toText(error)}`,
    };
  }
}

const sessionIdByTask = new Map<string, string>();
const sessionMcpScopeByTask = new Map<string, string>();
const activeRunByTask = new Map<string, Promise<void>>();
const claudeMcpConfigRefreshTracker = new McpConfigRefreshTracker();
const freshClaudeSessionScopes = new Set<string>();

const CLAUDE_COMMAND_CATALOG_TIMEOUT_MS = 15_000;

/**
 * In-flight catalog probes, keyed by the inputs that can change the result.
 *
 * The probe spawns a `claude` subprocess that connects every configured MCP
 * server, so overlapping probes mean duplicated remote connector handshakes
 * (Figma, Slack) competing with the real turn's. Collapsing concurrent callers
 * onto one promise keeps that to a single subprocess.
 */
const claudeCommandCatalogInFlight = new Map<
  string,
  Promise<ClaudeCommandCatalogResult>
>();

interface ClaudeCommandCatalogResult {
  ok: boolean;
  supported: boolean;
  commands: ReturnType<typeof toProviderSlashCommand>[];
  detail: string;
}

function toClaudeCommandCatalogKey(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const settingSources = args.runtimeOptions?.claudeSettingSources;
  return JSON.stringify([
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd(),
    args.runtimeOptions?.claudeBinaryPath ?? "",
    Array.isArray(settingSources) ? [...settingSources].sort() : null,
  ]);
}

export async function getClaudeCommandCatalog(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeCommandCatalogResult> {
  const key = toClaudeCommandCatalogKey(args);
  const inFlight = claudeCommandCatalogInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }
  const run = runClaudeCommandCatalogQuery(args).finally(() => {
    claudeCommandCatalogInFlight.delete(key);
  });
  claudeCommandCatalogInFlight.set(key, run);
  return run;
}

async function runClaudeCommandCatalogQuery(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeCommandCatalogResult> {
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
    const { mcpServers } = await resolveClaudeMcpServersForQuery({
      cwd: runtimeCwd,
      claudeExecutablePath,
      runtimeOptions: args.runtimeOptions,
    });

    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
        mcpServers,
      }),
    }) as Query;

    // Timed out here rather than in the caller so the `finally` below still
    // runs and closes the subprocess. A caller-side `Promise.race` left the
    // abandoned `claude` process alive, still holding MCP connector sessions.
    let timeoutHandle: NodeJS.Timeout | undefined;
    const commands = await Promise.race([
      stream.supportedCommands(),
      new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve(null),
          CLAUDE_COMMAND_CATALOG_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    });

    if (!commands) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail: "Timed out loading the Claude command catalog.",
      };
    }

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
    const { mcpServers } = await resolveClaudeMcpServersForQuery({
      cwd: runtimeCwd,
      claudeExecutablePath,
      runtimeOptions: args.runtimeOptions,
    });
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
        mcpServers,
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

export async function rewindClaudeFiles(args: {
  sessionId: string;
  userMessageId: string;
  dryRun: boolean;
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeFileRewindResponse> {
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
        canRewind: false,
        detail: "Claude SDK query() is unavailable.",
      };
    }
    const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
      runtimeOptions: args.runtimeOptions,
    });
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: {
          ...args.runtimeOptions,
          claudeEnableFileCheckpointing: true,
        },
        resume: args.sessionId,
        promptSuggestions: false,
      }),
    }) as Query;
    const result = await stream.rewindFiles(args.userMessageId, {
      dryRun: args.dryRun,
    });
    return {
      ok: true,
      canRewind: result.canRewind,
      detail:
        result.error ??
        (args.dryRun
          ? "Loaded the Claude file rewind preview."
          : "Rewound files to the selected Claude message."),
      ...(result.filesChanged ? { filesChanged: result.filesChanged } : {}),
      ...(result.insertions != null ? { insertions: result.insertions } : {}),
      ...(result.deletions != null ? { deletions: result.deletions } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      canRewind: false,
      detail: `Claude file rewind failed: ${toText(error)}`,
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
    const { mcpServers } = await resolveClaudeMcpServersForQuery({
      cwd: runtimeCwd,
      claudeExecutablePath,
      runtimeOptions: args.runtimeOptions,
    });
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
        mcpServers,
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
  sessionMcpScopeByTask.delete(taskId);
  activeRunByTask.delete(taskId);
}

function resolveSessionId(args: {
  taskId?: string;
  fallbackSessionId?: string;
}) {
  const taskKey = args.taskId ?? "default";
  return sessionIdByTask.get(taskKey) ?? args.fallbackSessionId?.trim();
}

function rememberSessionId(args: {
  taskId?: string;
  sessionId?: string;
  mcpScopeKey?: string;
}) {
  const nextSessionId = args.sessionId?.trim();
  if (!nextSessionId) {
    return;
  }
  const taskKey = args.taskId ?? "default";
  sessionIdByTask.set(taskKey, nextSessionId);
  if (args.mcpScopeKey) {
    sessionMcpScopeByTask.set(taskKey, args.mcpScopeKey);
  }
}

/**
 * A controllable async-iterable used as the `prompt` for a Claude turn so we can
 * push additional `SDKUserMessage`s into a live turn (mid-turn steering).
 *
 * The Claude Agent SDK only permits streaming input (`streamInput()` / pushing
 * more user messages into the same turn) when `query()` is invoked with an
 * `AsyncIterable` prompt from the start — a plain string prompt cannot be
 * upgraded mid-turn. We therefore always wrap the turn's initial prompt in this
 * queue and keep it open for the turn's lifetime.
 */
class SteerableUserMessageQueue implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = [];
  private waiters: Array<(r: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(message: SDKUserMessage): boolean {
    if (this.closed) {
      return false;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: message, done: false });
    } else {
      this.buffer.push(message);
    }
    return true;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({
        value: undefined as unknown as SDKUserMessage,
        done: true,
      });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({
            value: undefined as unknown as SDKUserMessage,
            done: true,
          });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

/**
 * How long a turn waits for MCP servers to leave `pending` before giving up.
 *
 * Remote connectors (Figma, Slack, …) handshake asynchronously after the CLI
 * reports `system:init`. Without this gate the model's first response is
 * generated from a tool list that does not yet contain those connectors, so it
 * reports them as disconnected — then a retry, hitting the same servers a
 * moment later, reports them as connected.
 */
const CLAUDE_MCP_READINESS_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(
    process.env.STAVE_CLAUDE_MCP_READINESS_TIMEOUT_MS ?? "",
    10,
  );
  // 0 is a legitimate value: it disables the gate.
  return Number.isFinite(raw) && raw >= 0 ? raw : 8_000;
})();
const CLAUDE_MCP_READINESS_POLL_MS = 200;

export interface ClaudeMcpReadinessResult {
  /** Servers still handshaking when the wait ended. */
  pending: string[];
  /** Servers that reached a terminal state without becoming usable. */
  unavailable: Array<{ name: string; status: string; error?: string }>;
  waitedMs: number;
  timedOut: boolean;
}

export function summarizeClaudeMcpReadiness(
  servers: readonly McpServerStatus[],
): Pick<ClaudeMcpReadinessResult, "pending" | "unavailable"> {
  const pending: string[] = [];
  const unavailable: ClaudeMcpReadinessResult["unavailable"] = [];
  for (const server of servers) {
    if (server.status === "pending") {
      pending.push(server.name);
      continue;
    }
    // `disabled` is a deliberate user choice, not a failure to report.
    if (server.status === "failed" || server.status === "needs-auth") {
      unavailable.push({
        name: server.name,
        status: server.status,
        ...(server.error ? { error: server.error } : {}),
      });
    }
  }
  return { pending, unavailable };
}

const CLAUDE_MCP_READINESS_NOTICE_NAME_LIMIT = 5;

function formatClaudeMcpReadinessNames(names: readonly string[]) {
  const shown = names.slice(0, CLAUDE_MCP_READINESS_NOTICE_NAME_LIMIT);
  const hidden = names.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} (+${hidden} more)` : shown.join(", ");
}

/**
 * Describes only what went wrong *on this turn*.
 *
 * `needs-auth` is deliberately excluded: it is a standing configuration state —
 * an account can easily carry dozens of unauthorized connectors — so including
 * it would attach a long, identical notice to every single turn. That state
 * belongs in the MCP settings pane, which reports it per connector.
 */
export function buildClaudeMcpReadinessNotice(
  readiness: ClaudeMcpReadinessResult,
): string | undefined {
  const parts: string[] = [];
  if (readiness.timedOut && readiness.pending.length > 0) {
    parts.push(
      `still connecting after ${Math.round(readiness.waitedMs / 1000)}s: ${formatClaudeMcpReadinessNames(readiness.pending)}`,
    );
  }
  const failed = readiness.unavailable.filter(
    (server) => server.status === "failed",
  );
  if (failed.length > 0) {
    const error = failed.find((server) => server.error)?.error;
    parts.push(
      `failed to connect: ${formatClaudeMcpReadinessNames(failed.map((server) => server.name))}${error ? ` (${error})` : ""}`,
    );
  }
  if (parts.length === 0) {
    return undefined;
  }
  return `MCP connectors unavailable for this turn — ${parts.join("; ")}. Tools from these servers are missing, so treat them as unavailable rather than reporting them as working.`;
}

/**
 * Blocks until no MCP server is `pending`, so the turn's prompt is only sent
 * once the tool list the model sees is complete.
 *
 * Returns `null` when readiness could not be determined (old CLI without the
 * control request, or a transport error) — callers then proceed unguarded
 * rather than stalling the turn.
 */
export async function waitForClaudeMcpReadiness(args: {
  stream: Pick<Query, "mcpServerStatus">;
  timeoutMs: number;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Resolves `null` once a single probe has outlived the remaining budget.
   * Separate from `sleep` so tests can drive polling on a fake clock without
   * that fake clock also winning every probe race.
   */
  probeDeadline?: (ms: number) => Promise<null>;
}): Promise<ClaudeMcpReadinessResult | null> {
  if (typeof args.stream.mcpServerStatus !== "function") {
    return null;
  }
  const now = args.now ?? (() => Date.now());
  const sleep =
    args.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const probeDeadline =
    args.probeDeadline ??
    ((ms: number) =>
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)));
  const startedAt = now();
  const deadline = startedAt + args.timeoutMs;

  let summary: Pick<ClaudeMcpReadinessResult, "pending" | "unavailable"> | null =
    null;
  for (;;) {
    if (args.signal?.aborted) {
      break;
    }
    let servers: McpServerStatus[] | null;
    try {
      // The probe is raced against the remaining budget, not just checked after
      // it resolves: a control channel that accepts the request and never
      // answers would otherwise hold the turn open forever.
      servers = await Promise.race([
        args.stream.mcpServerStatus(),
        probeDeadline(Math.max(0, deadline - now())),
      ]);
    } catch (error) {
      console.warn("[claude-sdk-runtime] MCP readiness probe failed", {
        detail: toText(error),
      });
      return summary
        ? { ...summary, waitedMs: now() - startedAt, timedOut: false }
        : null;
    }
    if (!servers) {
      break;
    }
    summary = summarizeClaudeMcpReadiness(servers);
    if (summary.pending.length === 0) {
      return { ...summary, waitedMs: now() - startedAt, timedOut: false };
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      break;
    }
    await sleep(Math.min(CLAUDE_MCP_READINESS_POLL_MS, remaining));
  }

  return summary
    ? { ...summary, waitedMs: now() - startedAt, timedOut: true }
    : null;
}

function isClaudeInitialStartupMessage(message: SDKMessage) {
  return (
    message.type === "system" &&
    (message as SDKSystemMessage).subtype === "init"
  );
}

/**
 * A streaming-input query can finish after SDK initialization but before it
 * consumes the first queued user message. That startup-only close is safe to
 * retry because the model has not produced output or invoked a tool yet.
 */
export async function* recoverClaudeStreamBeforeInitialTurnWork(args: {
  initialStream: AsyncIterable<SDKMessage>;
  createRecoveryStream: () => AsyncIterable<SDKMessage>;
  isAbortRequested: () => boolean;
  onRecovery?: () => void;
}): AsyncGenerator<SDKMessage> {
  let startupOnly = true;
  for await (const message of args.initialStream) {
    if (!isClaudeInitialStartupMessage(message)) {
      startupOnly = false;
    }
    yield message;
  }

  if (!startupOnly || args.isAbortRequested()) {
    return;
  }

  args.onRecovery?.();
  for await (const message of args.createRecoveryStream()) {
    yield message;
  }
}

type ClaudeMcpAuthenticateResult = {
  authUrl?: unknown;
  authorizationUrl?: unknown;
  requiresUserAction?: unknown;
  callbackExpected?: unknown;
};

export function resolveClaudeMcpOauthLoginResult(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return {
      requiresUserAction: false,
      callbackExpected: false,
    };
  }
  const record = response as Record<string, unknown>;
  const authorizationUrl =
    typeof record.authUrl === "string" && record.authUrl.trim()
      ? record.authUrl.trim()
      : typeof record.authorizationUrl === "string" &&
          record.authorizationUrl.trim()
        ? record.authorizationUrl.trim()
        : undefined;

  return {
    ...(authorizationUrl ? { authorizationUrl } : {}),
    requiresUserAction: record.requiresUserAction === true,
    callbackExpected: record.callbackExpected === true,
  };
}

// The SDK runtime exposes this control method even though its public Query
// declaration currently omits it. Keep the narrow compatibility adapter here.
type ClaudeMcpControlQuery = Query & {
  mcpAuthenticate: (
    serverName: string,
    redirectUri?: string,
  ) => Promise<ClaudeMcpAuthenticateResult>;
};

type ActiveClaudeMcpOauthFlow = {
  key: string;
  scopeKey: string;
  serverName: string;
  stream: ClaudeMcpControlQuery;
  input: SteerableUserMessageQueue;
  cancelled: boolean;
};

const CLAUDE_MCP_OAUTH_DEFAULT_TIMEOUT_SECS = 10 * 60;
const CLAUDE_MCP_OAUTH_POLL_INTERVAL_MS = 1_500;
const activeClaudeMcpOauthFlowByKey = new Map<
  string,
  ActiveClaudeMcpOauthFlow
>();

async function createClaudeMcpControlQuery(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  prompt: "" | AsyncIterable<SDKUserMessage>;
}) {
  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const mod = await getPrewarmedSdkModule();
  const queryFn = (
    mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
  ).query;

  if (!queryFn) {
    throw new Error("query() is unavailable from the Claude SDK import.");
  }

  const claudeExecutablePath = resolveClaudeRuntimeExecutablePath({
    runtimeOptions: args.runtimeOptions,
  });
  const { mcpServers } = await resolveClaudeMcpServersForQuery({
    cwd: runtimeCwd,
    claudeExecutablePath,
    runtimeOptions: args.runtimeOptions,
  });
  const stream = queryFn({
    prompt: args.prompt,
    options: buildClaudeQueryOptions({
      cwd: runtimeCwd,
      claudeExecutablePath,
      runtimeOptions: args.runtimeOptions,
      systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
      promptSuggestions: false,
      mcpServers,
    }),
  }) as ClaudeMcpControlQuery;

  return {
    runtimeCwd,
    scopeKey: `${claudeExecutablePath}\u0000${runtimeCwd}`,
    stream,
  };
}

function closeClaudeMcpOauthFlow(flow: ActiveClaudeMcpOauthFlow) {
  flow.cancelled = true;
  flow.input.close();
  flow.stream.close();
  if (activeClaudeMcpOauthFlowByKey.get(flow.key) === flow) {
    activeClaudeMcpOauthFlowByKey.delete(flow.key);
  }
}

function waitForClaudeMcpOauthPoll() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, CLAUDE_MCP_OAUTH_POLL_INTERVAL_MS);
  });
}

async function monitorClaudeMcpOauthFlow(args: {
  flow: ActiveClaudeMcpOauthFlow;
  timeoutSecs: number;
}) {
  const expiresAt = Date.now() + args.timeoutSecs * 1_000;
  try {
    while (!args.flow.cancelled && Date.now() < expiresAt) {
      await waitForClaudeMcpOauthPoll();
      if (args.flow.cancelled) {
        return;
      }

      const statuses = await args.flow.stream.mcpServerStatus();
      const target = statuses.find(
        (status) => status.name === args.flow.serverName,
      );
      if (!target) {
        continue;
      }
      toClaudeMcpServerStatusSnapshot(target, {
        scopeKey: args.flow.scopeKey,
        checkedAt: Date.now(),
      });
      if (target.status === "connected") {
        closeClaudeMcpOauthFlow(args.flow);
        return;
      }
      if (target.status === "failed") {
        closeClaudeMcpOauthFlow(args.flow);
        return;
      }
    }

    if (!args.flow.cancelled) {
      rememberClaudeMcpError({
        scopeKey: args.flow.scopeKey,
        serverName: args.flow.serverName,
        error:
          "OAuth login timed out before Claude reported a connected MCP server.",
      });
      closeClaudeMcpOauthFlow(args.flow);
    }
  } catch (error) {
    if (!args.flow.cancelled) {
      rememberClaudeMcpError({
        scopeKey: args.flow.scopeKey,
        serverName: args.flow.serverName,
        error: `OAuth status check failed: ${sanitizeMcpDiagnosticText(toText(error))}`,
      });
      closeClaudeMcpOauthFlow(args.flow);
    }
  }
}

export async function getClaudeMcpStatus(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeMcpStatusResponse> {
  const checkedAt = Date.now();
  let stream: ClaudeMcpControlQuery | null = null;
  try {
    const control = await createClaudeMcpControlQuery({
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
      prompt: "",
    });
    stream = control.stream;
    const statuses = await stream.mcpServerStatus();
    return {
      ok: true,
      detail:
        statuses.length > 0
          ? `Loaded ${statuses.length} Claude MCP server status${statuses.length === 1 ? "" : "es"} for ${control.runtimeCwd}.`
          : `No Claude MCP servers are configured for ${control.runtimeCwd}.`,
      servers: statuses.map((status) =>
        toClaudeMcpServerStatusSnapshot(status, {
          scopeKey: control.scopeKey,
          checkedAt,
        }),
      ),
      checkedAt,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude MCP status unavailable: ${sanitizeMcpDiagnosticText(toText(error))}`,
      servers: [],
      checkedAt,
    };
  } finally {
    stream?.close();
  }
}

export async function startClaudeMcpOauthLogin(args: {
  name: string;
  cwd?: string;
  timeoutSecs?: number;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeMcpOauthLoginResponse> {
  const serverName = args.name.trim();
  if (!serverName) {
    return {
      ok: false,
      detail: "Claude MCP OAuth login requires a server name.",
    };
  }

  const input = new SteerableUserMessageQueue();
  let stream: ClaudeMcpControlQuery | null = null;
  try {
    const control = await createClaudeMcpControlQuery({
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
      prompt: input,
    });
    stream = control.stream;
    const flowKey = `${control.scopeKey}\u0000${serverName}`;
    const existingFlow = activeClaudeMcpOauthFlowByKey.get(flowKey);
    if (existingFlow) {
      closeClaudeMcpOauthFlow(existingFlow);
    }

    const response = resolveClaudeMcpOauthLoginResult(
      await stream.mcpAuthenticate(serverName),
    );
    const { authorizationUrl, requiresUserAction, callbackExpected } = response;

    if ((requiresUserAction || callbackExpected) && !authorizationUrl) {
      return {
        ok: false,
        detail:
          `Claude MCP OAuth login for ${serverName} requires browser action, ` +
          "but the SDK did not return an authorization URL.",
        requiresUserAction,
        callbackExpected,
      };
    }

    if (authorizationUrl || requiresUserAction || callbackExpected) {
      const flow: ActiveClaudeMcpOauthFlow = {
        key: flowKey,
        scopeKey: control.scopeKey,
        serverName,
        stream,
        input,
        cancelled: false,
      };
      activeClaudeMcpOauthFlowByKey.set(flowKey, flow);
      stream = null;
      void monitorClaudeMcpOauthFlow({
        flow,
        timeoutSecs: args.timeoutSecs ?? CLAUDE_MCP_OAUTH_DEFAULT_TIMEOUT_SECS,
      });
    }

    return {
      ok: true,
      detail: authorizationUrl
        ? `Started Claude MCP OAuth login for ${serverName}.`
        : `Claude MCP server ${serverName} did not require browser authorization.`,
      ...(authorizationUrl ? { authorizationUrl } : {}),
      requiresUserAction,
      callbackExpected,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude MCP OAuth login failed: ${sanitizeMcpDiagnosticText(toText(error))}`,
    };
  } finally {
    if (stream) {
      input.close();
      stream.close();
    }
  }
}

export function cleanupClaudeMcpOauthFlows() {
  for (const flow of activeClaudeMcpOauthFlowByKey.values()) {
    closeClaudeMcpOauthFlow(flow);
  }
  activeClaudeMcpOauthFlowByKey.clear();
  claudeMcpRecentErrorByServer.clear();
}

/**
 * Build a minimal `SDKUserMessage` carrying plain text. `priority` and
 * `shouldQuery` are deliberately omitted — they are undocumented and leaving
 * them unset defaults to normal processing (query the model), which is exactly
 * what we want for a steered follow-up.
 */
function buildClaudeSDKUserMessage(args: { text: string }): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content: args.text },
    parent_tool_use_id: null,
  };
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
    registerSteerResponder?: (responder: ProviderSteerResponder) => void;
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
  let inputQueue: SteerableUserMessageQueue | null = null;
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
        { type: "done", stop_reason: "runtime_failure" },
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

    const claudeRuntimeEnv = buildClaudeEnv({
      executablePath: claudeExecutablePath,
      cwd: runtimeCwd,
    });
    const claudeMcpConfigPaths = getClaudeMcpConfigPaths({
      cwd: runtimeCwd,
      claudeConfigDir: claudeRuntimeEnv.CLAUDE_CONFIG_DIR,
    });
    const claudeMcpScopeKey = `claude:${claudeRuntimeEnv.CLAUDE_CONFIG_DIR ?? "default"}:${runtimeCwd}`;
    const claudeMcpRefresh = await claudeMcpConfigRefreshTracker.check({
      scopeKey: claudeMcpScopeKey,
      paths: claudeMcpConfigPaths,
    });
    if (claudeMcpRefresh.changed) {
      // Claude resumes preserve the native session's MCP catalog. Begin fresh
      // sessions after configuration changes; Stave still provides transcript
      // context through the rendered provider prompt.
      for (const [taskKey, scopeKey] of sessionMcpScopeByTask) {
        if (scopeKey === claudeMcpScopeKey) {
          sessionIdByTask.delete(taskKey);
        }
      }
      freshClaudeSessionScopes.add(claudeMcpScopeKey);
    }

    const secondaryReadOnly = args.executionPolicy === "secondary-read-only";
    // Resolve bound-secret env for the primary user turn only. Secondary
    // read-only analysis turns never receive injected secrets.
    const boundSecretEnv =
      secondaryReadOnly ||
      !args.runtimeOptions?.boundSecretIds ||
      args.runtimeOptions.boundSecretIds.length === 0
        ? {}
        : await resolveBoundSecretEnv({
            ids: args.runtimeOptions.boundSecretIds,
          });
    const existingSessionId = secondaryReadOnly
      ? undefined
      : resolveSessionId({
          taskId: args.taskId,
          fallbackSessionId: freshClaudeSessionScopes.has(claudeMcpScopeKey)
            ? undefined
            : resolveProviderResumeSessionId({
                conversation: args.conversation,
                fallbackResumeId: args.runtimeOptions?.claudeResumeSessionId,
              }),
        });
    // Resolved once and reused for both the system prompt and the agent
    // registration, so the brief can never describe a worker the query did not
    // actually register.
    const workerResolution = secondaryReadOnly
      ? { status: "off" as const }
      : resolveWorkerProfile({
          providerId: "claude-code",
          primaryModel: args.runtimeOptions?.model ?? "",
          intent: args.runtimeOptions?.workerIntent,
        });
    const claudeSystemPrompt = buildClaudeSystemPrompt({
      cwd: runtimeCwd,
      baseSystemPrompt: args.runtimeOptions?.claudeSystemPrompt,
      responseStylePrompt: args.runtimeOptions?.responseStylePrompt,
      ...(workerResolution.status === "ready"
        ? {
            workerInstructions: buildWorkerPrimaryInstructions(
              workerResolution.profile,
            ),
          }
        : {}),
    });
    const resolvedMcpServers = secondaryReadOnly
      ? { mcpServers: undefined, hasStaveLocalMcp: false }
      : await resolveClaudeMcpServersForQuery({
          cwd: runtimeCwd,
          claudeExecutablePath,
          runtimeOptions: args.runtimeOptions,
          claudeConfigDir: claudeRuntimeEnv.CLAUDE_CONFIG_DIR,
          unattendedAutomationAuthorizationToken:
            args.unattendedAutomation?.authorizationToken,
        });
    const claudePermissionMode = resolveClaudePermissionMode({
      runtimeValue: args.runtimeOptions?.claudePermissionMode,
      envValue: process.env.STAVE_CLAUDE_PERMISSION_MODE?.trim(),
      fallback: "acceptEdits",
    });
    const providerBrowserRequested = shouldActivateProviderBrowser({
      prompt: args.prompt,
      secondaryReadOnly,
      unattendedAutomation: Boolean(args.unattendedAutomation),
      planMode: claudePermissionMode === "plan",
    });
    const planModeApprovalScope = resolveClaudePlanModeApprovalScope({
      runtimeValue: args.runtimeOptions?.claudePlanModeApprovalScope,
      envValue: process.env.STAVE_CLAUDE_PLAN_MODE_APPROVAL_SCOPE?.trim(),
    });
    // Set once the agent presents its plan via ExitPlanMode during a plan-mode
    // turn. After that point Stave has the plan (captured + persisted + shown
    // in the PlanViewer for review), so the turn must wind down; further tool
    // calls are denied so the agent stops and the turn can complete.
    let planPresentedInTurn = false;
    const approvalDecisionTimeoutMs = resolveClaudeApprovalDecisionTimeoutMs({
      envValue: process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS,
    });
    let nextClaudeUserInputRequestOrdinal = 1;
    const createClaudeUserInputRequestId = (prefix: string) =>
      `${prefix}-${Date.now()}-${nextClaudeUserInputRequestOrdinal++}`;
    const promptConversation = args.conversation
      ? filterPromptRetrievedContext({
          conversation: args.conversation,
          excludedSourceIds: resolvedMcpServers.hasStaveLocalMcp
            ? []
            : ["stave:current-task-awareness"],
        })
      : args.conversation;
    const providerPrompt = buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: promptConversation,
      activeResumeSessionId: existingSessionId ?? null,
    });
    const activatedSkillSlugs = collectClaudeActivatedSkillSlugs({
      conversation: args.conversation,
    });
    // Always run in streaming-input mode so a follow-up can be steered into the
    // live turn. The SDK requires an AsyncIterable prompt from the start for
    // this to be legal — a plain string prompt cannot be upgraded mid-turn.
    // The prompt is intentionally NOT pushed yet. The queue stays empty until
    // the MCP readiness gate below clears, so the CLI only receives the user
    // message once the tool list it will show the model is complete. The steer
    // responder is registered after that push for the same reason — a steer
    // arriving during the gate must not jump ahead of the primary message.
    inputQueue = new SteerableUserMessageQueue();
    let queryOptions: Options | null = null;
    const queryResult = queryFn({
      prompt: inputQueue,
      options: (queryOptions = buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        permissionMode: claudePermissionMode,
        resume: existingSessionId,
        systemPrompt: claudeSystemPrompt,
        includePartialMessages: true,
        promptSuggestions: true,
        workerModeEligible: true,
        mcpServers: resolvedMcpServers.mcpServers,
        secondaryReadOnly,
        providerBrowserRequested,
        secretEnv: boundSecretEnv,
        onElicitation: async (request, options) => {
          const requestId =
            createClaudeUserInputRequestId("claude-elicitation");
          const elicitation = mapClaudeElicitationToUserInput(request);
          if (!elicitation) {
            return { action: "decline" };
          }

          if (
            shouldAutoAcceptClaudeElicitation({
              unattendedAutomation: Boolean(args.unattendedAutomation),
              elicitation,
            })
          ) {
            return elicitation.mode === "url"
              ? { action: "accept" }
              : { action: "accept", content: {} };
          }

          const userInputEvent: BridgeEvent = {
            type: "user_input",
            toolName: "mcp_elicitation",
            requestId,
            questions: elicitation.questions,
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
            if (response.denied) {
              return { action: "decline" };
            }
            if (elicitation.mode === "url") {
              return { action: "accept" };
            }
            const content = Object.fromEntries(
              elicitation.fields.flatMap((field) => {
                const rawValue = response.answers?.[field.key];
                if (typeof rawValue !== "string") {
                  return [];
                }
                const coerced = coerceClaudeElicitationAnswer({
                  rawValue,
                  field,
                });
                return coerced === undefined ? [] : [[field.key, coerced]];
              }),
            );
            return { action: "accept", content };
          } catch (error) {
            if (error instanceof ClaudeToolDecisionTimeoutError) {
              emitClaudeApprovalTimeoutBridgeEvent({
                eventCollector,
                onEvent: args.onEvent,
                kind: "user_input",
                toolName: "mcp_elicitation",
                requestId,
                timeoutMs: error.timeoutMs,
              });
              return { action: "decline" };
            }
            throw error;
          }
        },
        onUserDialog: async (request, options) => {
          const dialog = mapClaudeUserDialogToUserInput(request);
          if (!dialog) {
            return { behavior: "cancelled" };
          }
          const requestId =
            createClaudeUserInputRequestId("claude-user-dialog");
          const userInputEvent: BridgeEvent = {
            type: "user_input",
            toolName: request.dialogKind,
            requestId,
            questions: dialog.questions,
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
            if (response.denied) {
              return { behavior: "cancelled" };
            }
            const answer = response.answers?.[dialog.answerKey]?.trim() ?? "";
            return {
              behavior: "completed",
              result: {
                prompt: answer,
                text: answer,
                value: answer,
                answer,
              },
            };
          } catch (error) {
            if (error instanceof ClaudeToolDecisionTimeoutError) {
              emitClaudeApprovalTimeoutBridgeEvent({
                eventCollector,
                onEvent: args.onEvent,
                kind: "user_input",
                toolName: request.dialogKind,
                requestId,
                timeoutMs: error.timeoutMs,
              });
              return { behavior: "cancelled" };
            }
            throw error;
          }
        },
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

          if (
            args.executionPolicy === "secondary-read-only" &&
            shouldDenyClaudeToolInSecondaryReadOnly({
              toolName,
              input: normalizedInput,
            })
          ) {
            return buildClaudeDenyPermissionResult({
              message:
                "Secondary provider runs allow only local read-only inspection.",
              context: "approval:secondary-read-only",
            });
          }

          if (
            providerBrowserRequested &&
            isClaudeChromeToolName(toolName)
          ) {
            return buildClaudeApprovalPermissionResult({
              approved: true,
              normalizedInput,
              denialMessage: `The provider-native browser denied ${toolName}.`,
            });
          }

          // In plan mode, once the agent has presented a plan via ExitPlanMode,
          // Stave captures it, persists it under .stave/context/plans, and shows
          // it in the PlanViewer for explicit review — the turn must end there
          // so the user can reply. Some workspace instructions (e.g. the handoff
          // convention) tell the agent to keep working after ExitPlanMode, and
          // with broad plan-mode approval scopes those follow-up calls would
          // auto-run and the turn would never finish (stuck "loading"). Deny
          // every post-plan tool call except re-presenting an updated plan, so
          // the agent stops and the turn completes.
          if (
            shouldDenyClaudePostPlanTool({
              permissionMode: claudePermissionMode,
              planPresented: planPresentedInTurn,
              toolName,
            })
          ) {
            return buildClaudeDenyPermissionResult({
              message:
                "Your plan was already presented to the user for review in Stave and saved under .stave/context/plans. Stop now and wait — do not run any more tools. The user will approve or revise the plan in a separate turn.",
              context: "approval:plan-already-presented",
            });
          }
          if (toolName.trim().toLowerCase() === "exitplanmode") {
            planPresentedInTurn = true;
            // Force the turn to end here, mirroring Codex's
            // requestPlanInterrupt(): the PlanViewer's Approve/Revise actions
            // and the prompt input stay locked until a `done` event clears
            // the active-turn flag, and `done` is only synthesized once the
            // stream's `for await` loop sees a final `result` message. Denying
            // subsequent tool calls (above) only stops the *next* tool call —
            // if the model keeps trying to call tools (or narrates) instead of
            // ending its turn, the loop never reaches `result` and the turn
            // hangs "waiting" forever. `interrupt()` stops generation for the
            // current turn without closing the session (unlike `close()`), so
            // a `result` message still follows and `done` gets emitted
            // normally, while the query stays alive for the user's next reply.
            void stream?.interrupt().catch((error) => {
              console.error(
                "[claude-sdk-runtime] Failed to interrupt turn after plan was presented",
                error,
              );
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
              // Same as the approval event below: `agentID` is set only when
              // the question came from inside a subagent, which is exactly
              // when the work graph needs it — the prompt lands on the worker
              // that asked instead of reading as the whole turn being stuck.
              ...(options.agentID ? { ownerAgentId: options.agentID } : {}),
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

          // Plan mode reaches here only for non-mutating tool calls (mutating
          // file tools and mutating Bash were hard-denied above). Skip the
          // approval prompt for the tool classes the user opted into via the
          // plan-mode approval scope, so planning feels like auto mode.
          if (
            claudePermissionMode === "plan" &&
            shouldAutoAllowPlanModeScopedTool({
              scope: planModeApprovalScope,
              toolName,
              input: normalizedInput,
            })
          ) {
            return buildClaudeApprovalPermissionResult({
              approved: true,
              normalizedInput,
              denialMessage: `Claude plan mode auto-allowed ${toolName}.`,
            });
          }

          if (permissionModeDecision === "deny") {
            return buildClaudeDenyPermissionResult({
              message: `Claude permission mode ${claudePermissionMode} denied ${toolName} without prompting.`,
              context: "approval:permission-mode-deny",
            });
          }

          const trustedApprovalInput = resolveTrustedApprovalInput({
            toolName,
            input: normalizedInput,
          });
          if (
            isTrustedApproval({
              trustedTools: args.runtimeOptions?.trustedTools,
              toolName,
              input: trustedApprovalInput,
            })
          ) {
            return buildClaudeApprovalPermissionResult({
              approved: true,
              normalizedInput,
              denialMessage: `Claude trusted ${toolName}.`,
            });
          }

          const approvalEvent: BridgeEvent = {
            type: "approval",
            toolName,
            requestId,
            description: summarizeClaudePermissionRequest({
              toolName,
              input: normalizedInput,
              title: options.title,
              displayName: options.displayName,
              description: options.description,
              decisionReason: options.decisionReason,
              blockedPath: options.blockedPath,
            }),
            ...(trustedApprovalInput ? { input: trustedApprovalInput } : {}),
            // `agentID` is set only when the call came from inside a subagent,
            // which is exactly when the work graph needs it: it names the one
            // worker of the fan-out whose progress this prompt is holding up.
            ...(options.agentID ? { ownerAgentId: options.agentID } : {}),
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
      })),
    }) as Query;
    stream = queryResult;

    // Register abort handler using the official Query.close() method
    const gateAbort = new AbortController();
    let abortRequested = false;
    args.registerAbort?.(() => {
      abortRequested = true;
      gateAbort.abort();
      inputQueue?.close();
      stream?.close();
    });

    // MCP readiness gate. Remote connectors handshake asynchronously after the
    // CLI reports `system:init`, so sending the prompt immediately makes the
    // model answer from an incomplete tool list — the cause of "Figma/Slack are
    // disconnected" on one turn and "connected" on the retry. Holding the
    // prompt back costs nothing when every server is already up: the probe
    // returns on its first round trip.
    if (!secondaryReadOnly && CLAUDE_MCP_READINESS_TIMEOUT_MS > 0) {
      const readiness = await waitForClaudeMcpReadiness({
        stream: queryResult,
        timeoutMs: CLAUDE_MCP_READINESS_TIMEOUT_MS,
        signal: gateAbort.signal,
      });
      // Surfaced as a turn event rather than folded into the prompt: the user
      // needs to know a capability is missing, and the model must not be told a
      // connector is fine when it is not.
      const notice = readiness
        ? buildClaudeMcpReadinessNotice(readiness)
        : undefined;
      if (readiness && notice) {
        console.warn("[claude-sdk-runtime] MCP connectors not ready", {
          pending: readiness.pending,
          unavailable: readiness.unavailable,
          waitedMs: readiness.waitedMs,
        });
        args.onEvent?.({ type: "system", content: notice });
      }
    }

    const initialPromptMessage = buildClaudeSDKUserMessage({
      text: providerPrompt,
    });
    if (!gateAbort.signal.aborted) {
      const accepted = inputQueue.push(initialPromptMessage);
      if (!accepted && !abortRequested) {
        throw new Error(
          "Claude input queue closed before the initial prompt was accepted.",
        );
      }
    }
    args.registerSteerResponder?.(async ({ text }) => {
      if (
        !inputQueue ||
        !inputQueue.push(buildClaudeSDKUserMessage({ text }))
      ) {
        return {
          ok: false,
          reason: "turn-not-steerable",
          pendingRequestIds: [],
        };
      }
      return { ok: true };
    });

    // Intentional provider asymmetry (see `the-provider-runtime-symmetry`):
    // unlike the Codex adapter, which spawns and owns its app-server
    // `ChildProcess` directly (`codex-app-server-runtime.ts`'s
    // `onProcessExit`/`teardownProcess`), this loop consumes the
    // `@anthropic-ai/claude-agent-sdk` `Query` async iterator, whose public
    // type does not expose the underlying CLI subprocess. There is no
    // supported way to attach an "exit" listener here, so a genuinely dead
    // subprocess that the SDK fails to surface as a thrown/ended iteration
    // cannot be detected at this layer. The safety net for that case is
    // provider-agnostic instead: `autoAbortStalledTaskTurn` in
    // `src/store/app.store.ts` force-ends any turn (Claude or Codex) that
    // goes silent for `PROVIDER_TURN_STALL_THRESHOLD_MS +
    // PROVIDER_TURN_AUTO_ABORT_GRACE_MS`, regardless of the underlying cause.
    let hasStreamedText = false;
    let hasStreamedThinking = false;
    const emittedToolUseIds = new Set<string>();
    const planStreamState = createClaudePlanStreamState();
    let finalStopReason: string | undefined;
    const claudeDebugStream =
      args.runtimeOptions?.debug ?? process.env.STAVE_CLAUDE_DEBUG === "1";
    const subagentTracker = new SubagentProgressTracker();
    const recoverableStream = recoverClaudeStreamBeforeInitialTurnWork({
      initialStream: queryResult,
      isAbortRequested: () => abortRequested,
      onRecovery: () => {
        console.warn(
          "[claude-sdk-runtime] Claude query closed before initial turn work; retrying with the prompt preloaded",
          { taskId: args.taskId },
        );
      },
      createRecoveryStream: () => {
        inputQueue?.close();
        queryResult.close();

        const recoveryInputQueue = new SteerableUserMessageQueue();
        if (!recoveryInputQueue.push(initialPromptMessage)) {
          throw new Error(
            "Claude recovery input queue closed before the initial prompt was accepted.",
          );
        }
        if (!queryOptions) {
          throw new Error("Claude query options were unavailable for recovery.");
        }
        inputQueue = recoveryInputQueue;
        const recoveryQuery = queryFn({
          prompt: recoveryInputQueue,
          options: queryOptions,
        }) as Query;
        stream = recoveryQuery;
        return recoveryQuery;
      },
    });

    for await (const message of recoverableStream) {
      if (
        message.type === "system" &&
        (message as SDKSystemMessage).subtype === "init"
      ) {
        if (!secondaryReadOnly) {
          rememberSessionId({
            taskId: args.taskId,
            sessionId: (message as SDKSystemMessage).session_id,
            mcpScopeKey: claudeMcpScopeKey,
          });
        }
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
          // agentId comes from the message's own task_id; ownerAgentId is
          // omitted when the tool_use_id came from the positional fallback,
          // since a guessed correlation must not become an identity.
          const progressEvent = buildClaudeSubagentProgressEvent({
            summary,
            resolution: subagentTracker.resolveProgress(
              message as Record<string, unknown>,
            ),
          });
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
      finalStopReason = resolveClaudeTurnStopReason({
        message,
        currentStopReason: finalStopReason,
      });
      if (message.type === "result") {
        // In streaming-input mode the SDK keeps the query open waiting for the
        // next input message; unlike string-prompt mode it will NOT end the
        // stream after emitting `result`. Close the input queue now so the
        // `for await` loop can terminate and the turn completes. Any steer
        // pushed before this point is already buffered and still drains before
        // the iterator signals done; a steer arriving after close is rejected
        // (returns false), and the store falls back to queuing it as a new
        // turn — the correct behavior once the response has finished.
        inputQueue?.close();
      }
      let normalizedEvents = mapClaudeMessageToEvents({
        message,
        claudeDebugStream,
        cwd: runtimeCwd,
        planState: planStreamState,
        ownerAgentIdResolver: subagentTracker,
        providerBrowserRequested,
      });
      normalizedEvents = attachClaudeWorkerExecutionMetadata({
        events: normalizedEvents,
        profile:
          workerResolution.status === "ready" ? workerResolution.profile : null,
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

    const terminalStopReason = resolveClaudeStreamTerminalStopReason({
      abortRequested,
      currentStopReason: finalStopReason,
    });
    const done: BridgeEvent = terminalStopReason
      ? { type: "done", stop_reason: terminalStopReason }
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
      { type: "done", stop_reason: "runtime_failure" },
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

    // Close the steering input queue so any racing steer attempt gets a clean
    // rejection instead of buffering into a closed turn forever.
    try {
      inputQueue?.close();
    } catch {
      // close() is idempotent — ignore.
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
        env: buildClaudeEnv({
          executablePath: claudeExecutablePath,
          cwd: args.cwd || process.cwd(),
        }),
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

const ROUTE_CLASSIFIER_TASK_TYPES = [
  "quick_edit",
  "plan",
  "implementation",
  "debug",
  "review",
  "general",
  "safety",
] as const;

const ROUTE_CLASSIFIER_COMPLEXITIES = ["low", "medium", "high"] as const;
const ROUTE_CLASSIFIER_TIERS = [
  "light",
  "standard",
  "heavy",
  "frontier",
] as const;

type RouteClassifierTaskType = (typeof ROUTE_CLASSIFIER_TASK_TYPES)[number];
type RouteClassifierComplexity = (typeof ROUTE_CLASSIFIER_COMPLEXITIES)[number];
type RouteClassifierTier = (typeof ROUTE_CLASSIFIER_TIERS)[number];

export interface ClaudeRouteClassification {
  taskType: RouteClassifierTaskType;
  complexity: RouteClassifierComplexity;
  recommendedTier: RouteClassifierTier;
  confidence: number;
  rationale?: string;
  stick?: boolean;
}

function isRouteClassifierTaskType(
  value: unknown,
): value is RouteClassifierTaskType {
  return (
    typeof value === "string" &&
    ROUTE_CLASSIFIER_TASK_TYPES.includes(value as RouteClassifierTaskType)
  );
}

function isRouteClassifierComplexity(
  value: unknown,
): value is RouteClassifierComplexity {
  return (
    typeof value === "string" &&
    ROUTE_CLASSIFIER_COMPLEXITIES.includes(value as RouteClassifierComplexity)
  );
}

function isRouteClassifierTier(value: unknown): value is RouteClassifierTier {
  return (
    typeof value === "string" &&
    ROUTE_CLASSIFIER_TIERS.includes(value as RouteClassifierTier)
  );
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

export function parseClaudeRouteClassificationJson(text: string): {
  ok: boolean;
  classification?: ClaudeRouteClassification;
} {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return { ok: false };
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (
      !isRouteClassifierTaskType(parsed.taskType) ||
      !isRouteClassifierComplexity(parsed.complexity) ||
      !isRouteClassifierTier(parsed.recommendedTier)
    ) {
      return { ok: false };
    }
    const confidence =
      typeof parsed.confidence === "number" &&
      Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0;
    return {
      ok: true,
      classification: {
        taskType: parsed.taskType,
        complexity: parsed.complexity,
        recommendedTier: parsed.recommendedTier,
        confidence,
        ...(typeof parsed.rationale === "string"
          ? { rationale: parsed.rationale.slice(0, 400) }
          : {}),
        ...(typeof parsed.stick === "boolean" ? { stick: parsed.stick } : {}),
      },
    };
  } catch {
    return { ok: false };
  }
}

export async function classifyClaudeRoute(args: {
  prompt: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
    providerId?: "claude-code" | "codex";
    model?: string;
  }>;
  fileContextCount?: number;
}): Promise<{ ok: boolean; classification?: ClaudeRouteClassification }> {
  try {
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = getPrewarmedExecutablePath();
    const historyLines = (args.history ?? [])
      .slice(-8)
      .map((message) => {
        const provider = message.providerId ? ` ${message.providerId}` : "";
        const model = message.model ? ` ${message.model}` : "";
        return `${message.role}${provider}${model}: ${message.content.slice(0, 500)}`;
      })
      .join("\n");

    const classifierPrompt = [
      "Classify the next Stave coding turn for model routing.",
      "Return ONLY valid compact JSON. Do not include markdown.",
      'Shape: {"taskType":"quick_edit|plan|implementation|debug|review|general|safety","complexity":"low|medium|high","recommendedTier":"light|standard|heavy|frontier","confidence":0.0,"rationale":"short","stick":false}',
      "Use stick=true when confidence is low or the existing provider should not be changed.",
      `Attached file context count: ${Math.max(0, args.fileContextCount ?? 0)}`,
      "",
      ...(historyLines ? [`History:\n${historyLines}`, ""] : []),
      `Prompt:\n${args.prompt.slice(0, 4000)}`,
    ].join("\n");

    const stream = queryFn({
      prompt: classifierPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath
          ? { pathToClaudeCodeExecutable: claudeExecutablePath }
          : {}),
        env: buildClaudeEnv({
          executablePath: claudeExecutablePath,
          cwd: args.cwd || process.cwd(),
        }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type !== "assistant") {
        continue;
      }
      const assistantMsg = message as SDKAssistantMessage;
      const contentBlocks = assistantMsg.message?.content;
      if (!Array.isArray(contentBlocks)) {
        continue;
      }
      for (const block of contentBlocks) {
        const typedBlock = block as { type?: string; text?: string };
        if (typedBlock.type === "text" && typedBlock.text) {
          textParts.push(typedBlock.text);
        }
      }
    }

    return parseClaudeRouteClassificationJson(textParts.join("").trim());
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
  prompt: string;
  model?: string;
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
    const prPrompt = args.prompt.trim();
    if (!prPrompt) {
      return { ok: false };
    }

    const stream = queryFn({
      prompt: prPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: args.cwd || process.cwd(),
        model: args.model?.trim() || "claude-haiku-4-5",
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

// ── Pre-PR diff review ──────────────────────────────────────────────────────
// Runs a single-turn Claude review over the PR diff before the branch is pushed.
// This is deliberately isolated from the user's chat session and returns a
// structured best-effort result so PR creation can continue on model failure.

export async function reviewClaudeWorktreeDiff(args: {
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
}): Promise<{ ok: boolean; findings?: PrePrReviewFinding[] }> {
  try {
    const mod = await getPrewarmedSdkModule();
    const queryFn = (
      mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }
    ).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = getPrewarmedExecutablePath();
    const reviewPrompt =
      args.mode === "intent"
        ? buildIntentGuardPrompt({
            diff: args.diff,
            workingTreeDiff: args.workingTreeDiff,
            fileList: args.fileList,
            intentContext: args.intentContext ?? "",
          })
        : buildReviewDiffPrompt(args);

    const stream = queryFn({
      prompt: reviewPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: args.cwd || process.cwd(),
        model: args.model?.trim() || "claude-sonnet-5",
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

    return { ok: true, findings: parseReviewFindings(textParts.join("")) };
  } catch {
    return { ok: false };
  }
}
