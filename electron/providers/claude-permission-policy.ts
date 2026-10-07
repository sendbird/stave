import { z } from "zod";
import { toText } from "./utils";
import { isAlwaysAllowedStaveLocalMcpTool, isPromptFreeStaveLocalMcpTool } from "./stave-local-mcp-approval";

/** SDK-level permission modes accepted by the claude-agent-sdk query() API. */
export type ClaudePermissionMode =
  "default" | "acceptEdits" | "bypassPermissions" | "dontAsk" | "auto";

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
const CLAUDE_MUTATING_FILE_TOOL_NAME_SET = new Set(
  CLAUDE_MUTATING_FILE_TOOL_NAMES.map((toolName) => toolName.toLowerCase()),
);
/**
 * Claude Code built-in tools that cannot mutate the filesystem or task state.
 * Auto mode lets these through without asking, since an approval prompt for
 * each Read/Grep/Glob/WebFetch/WebSearch/BashOutput/NotebookRead call is pure
 * noise. Bash is intentionally excluded: even "read-only" commands can have
 * network side effects, so we keep prompting for it.
 *
 * TodoWrite is included because it only mutates the in-session todo tracker,
 * never the filesystem.
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
 * Tokens that mark a (non-Stave) MCP tool as read-only vs. mutating. An MCP
 * tool is treated as read-only only when it contains a read verb AND no write
 * verb — anything ambiguous keeps prompting, so misclassification fails safe
 * (toward asking the user).
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

export function extractClaudeBashCommand(input: Record<string, unknown>) {
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
 * Claude's own plan-mode tools. Stave has no plan mode: a turn always runs in
 * the permission mode the user chose, so the agent must not switch itself into
 * a read-only planning state that then waits for an approval Stave never asks.
 */
const CLAUDE_ALWAYS_DISALLOWED_TOOL_NAMES = [
  "EnterPlanMode",
  "ExitPlanMode",
] as const;

export function resolveClaudeDisallowedTools(args: {
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
  CLAUDE_ALWAYS_DISALLOWED_TOOL_NAMES.forEach((toolName) => {
    merged.add(toolName);
  });
  return [...merged];
}

export function resolveClaudePermissionModeDecision(args: {
  permissionMode: ClaudePermissionMode;
  toolName: string;
  keepReadOnlyPrompt?: boolean; // auto only: see `claude-auto-mode.ts`
}) {
  const normalizedToolName = args.toolName.trim().toLowerCase();
  // AskUserQuestion requests information, not permission to perform an action.
  // Keep it interactive even when action approvals are bypassed or denied.
  if (normalizedToolName === "askuserquestion") {
    return "prompt" as const;
  }
  if (isAlwaysAllowedStaveLocalMcpTool(normalizedToolName)) {
    return "allow" as const;
  }
  if ((args.permissionMode === "auto" || args.permissionMode === "dontAsk") && normalizedToolName.startsWith(STAVE_LOCAL_MCP_TOOL_PREFIX) &&
    isPromptFreeStaveLocalMcpTool(normalizedToolName, args.permissionMode)) {
    return "allow" as const;
  }
  if (args.permissionMode === "bypassPermissions") {
    return "allow" as const;
  }
  if (
    (args.permissionMode === "acceptEdits" || args.permissionMode === "auto") &&
    CLAUDE_MUTATING_FILE_TOOL_NAME_SET.has(normalizedToolName)
  ) {
    return "allow" as const;
  }
  // Auto reaches here only when the CLI hands a call over, and already lets
  // edits through, so asking about each read is noise.
  if (
    args.permissionMode === "auto" &&
    args.keepReadOnlyPrompt !== true &&
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

export function resolveTrustedApprovalInput(args: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  if (args.toolName.trim().toLowerCase() === "bash") {
    return extractClaudeBashCommand(args.input)?.trim() || undefined;
  }
  return undefined;
}
