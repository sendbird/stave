import { z } from "zod";
import {
  DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE,
  type ClaudePlanModeApprovalScope,
} from "../../src/types/chat";
import { toText } from "./utils";
import { isAlwaysAllowedStaveLocalMcpTool } from "./stave-local-mcp-approval";

/** SDK-level permission modes accepted by the claude-agent-sdk query() API. */
export type ClaudePermissionMode =
  "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";

const ClaudePermissionResultSchema = z.union([
  z.object({
    behavior: z.literal("allow"),
    updatedInput: z.record(z.string(), z.unknown()),
  }),
  z.object({
    behavior: z.literal("deny"),
    message: z.string(),
    interrupt: z.boolean().optional(),
  }),
]);

export type ClaudePermissionResult = z.infer<typeof ClaudePermissionResultSchema>;
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

export function resolveClaudePermissionMode(args: {
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

export function validateClaudePermissionResult(args: {
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

export function buildClaudeDenyPermissionResult(args: {
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

export function resolveTrustedApprovalInput(args: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  if (args.toolName.trim().toLowerCase() === "bash") {
    return extractClaudeBashCommand(args.input)?.trim() || undefined;
  }
  return undefined;
}
