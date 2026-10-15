import { randomBytes } from "node:crypto";
import type { StreamTurnArgs } from "../types";
import { STAVE_LOCAL_MCP_NEVER_AUTO_APPROVED_TOOLS } from "../stave-local-mcp-approval";

type OpenCodeRuntimeOptions = NonNullable<StreamTurnArgs["runtimeOptions"]>;
type PermissionRules = Record<string, unknown>;

export const OPENCODE_CONFIG_CONTENT_ENV = "OPENCODE_CONFIG_CONTENT";
/** OpenCode's own primary agent; Auto turns run it with the user's rules. */
export const OPENCODE_BUILD_AGENT = "build";
/**
 * Name prefixes of the agents Stave defines for a turn. Each turn appends a
 * random suffix, so no global or project config file can define the same
 * agent first: OpenCode 1.x merges a file's agent of the same name key by
 * key and keeps the file's key order, which would let the file's rules come
 * last and win.
 */
export const OPENCODE_STAVE_MANUAL_AGENT_PREFIX = "stave-manual-";
export const OPENCODE_STAVE_READ_ONLY_AGENT_PREFIX = "stave-read-only-";
/** How OpenCode names a Local MCP tool: `<server>_<tool>`. */
const STAVE_LOCAL_MCP_TOOL_PREFIX = "stave-local-mcp_";

/**
 * Stave tools that answer another task's prompt. OpenCode never receives them
 * (the Local MCP proxy hides and refuses them), and every agent also asks
 * before them, so neither layer alone has to hold.
 */
export const OPENCODE_LOCAL_MCP_DENIED_TOOLS = STAVE_LOCAL_MCP_NEVER_AUTO_APPROVED_TOOLS;

export class OpenCodeConfigContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeConfigContentError";
  }
}

type OpenCodeTurnAgentKind = "manual" | "read-only" | "build";

function resolveOpenCodeTurnAgentKind(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
}): OpenCodeTurnAgentKind {
  if (args.denyEdits) return "read-only";
  return args.approvalMode === "auto" ? "build" : "manual";
}

/**
 * The agent a turn runs as, named afresh on every call. Manual and read-only
 * use an agent Stave defines, so its permission object is Stave's alone:
 * OpenCode merges config layers key by key and keeps each key's first
 * position, and evaluates rules last match wins, so rules added to a built-in
 * agent can be outranked by a user's rule for the same key in a global or
 * project file. An agent's rules are evaluated after the global ones, so the
 * Stave agent's rules decide. Auto runs OpenCode's own `build`.
 */
export function resolveOpenCodeTurnAgent(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
}) {
  const kind = resolveOpenCodeTurnAgentKind(args);
  if (kind === "build") return OPENCODE_BUILD_AGENT;
  const prefix =
    kind === "read-only"
      ? OPENCODE_STAVE_READ_ONLY_AGENT_PREFIX
      : OPENCODE_STAVE_MANUAL_AGENT_PREFIX;
  return `${prefix}${randomBytes(8).toString("hex")}`;
}

/**
 * Tools OpenCode 2.x runs without a permission check, so `ask` never reaches
 * them: code-mode `execute` (its script and its `fetch` global, which can
 * send any HTTP request), the code-mode tools in the `opencode` namespace
 * (`worktree_create`, `session_move`, `session_rename`, ...) and the desktop
 * browser tools (permission name `browser`). OpenCode removes a tool from the
 * session only when the agent's last matching rule for it is a wildcard
 * `deny`. Denying `execute` also removes MCP tools on 2.x, which serves them
 * only through it. OpenCode 1.x has none of these tools and ignores the keys.
 */
const OPENCODE_UNGATED_TOOL_DENIES = Object.freeze({
  "opencode_*": "deny",
  browser: "deny",
  execute: "deny",
});

/**
 * The permission object of the Stave agent, or null for Auto, which keeps
 * OpenCode's `build` agent and the user's rules.
 *
 * `*` comes first because OpenCode applies the last matching rule.
 * `task` is denied because a subagent runs under its own agent's rules, which
 * Stave does not own; asking once before starting it would let every tool
 * call inside run unasked.
 */
export function buildOpenCodePermissionRules(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
}): PermissionRules | null {
  const kind = resolveOpenCodeTurnAgentKind(args);
  if (kind === "read-only") {
    return { "*": "ask", edit: "deny", task: "deny", ...OPENCODE_UNGATED_TOOL_DENIES };
  }
  if (kind === "manual") {
    return { "*": "ask", task: "deny", ...OPENCODE_UNGATED_TOOL_DENIES };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Removes `//` and `/* *\/` comments outside strings. */
function stripJsoncComments(text: string) {
  let output = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    if (inString) {
      output += char;
      if (char === "\\") {
        output += next ?? "";
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      output += "\n";
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end < 0) throw new SyntaxError("Unterminated block comment.");
      index = end + 1;
      output += " ";
    } else {
      output += char;
    }
  }
  return output;
}

/** Removes a comma that is followed only by whitespace and `}` or `]`. */
function stripTrailingCommas(text: string) {
  let output = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      output += char;
      if (char === "\\") {
        output += text[index + 1] ?? "";
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead]!)) lookahead += 1;
      if (text[lookahead] === "}" || text[lookahead] === "]") continue;
    }
    output += char;
  }
  return output;
}

/**
 * Parses an inherited `OPENCODE_CONFIG_CONTENT` the way OpenCode reads it:
 * JSONC, so comments and trailing commas are allowed. A value Stave cannot
 * read is never replaced; the turn stops instead, so the user's inline
 * config is not silently dropped.
 */
export function parseOpenCodeConfigContent(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripTrailingCommas(stripJsoncComments(text)));
  } catch {
    // The parser's message quotes the input, and the value can hold
    // credentials, so the error that reaches the conversation names only the
    // variable.
    throw new OpenCodeConfigContentError(
      `${OPENCODE_CONFIG_CONTENT_ENV} in Stave's environment has a JSON or JSONC syntax error. Stave did not start OpenCode, so that inline config was not replaced. Fix or unset it and send again.`,
    );
  }
  const record = asRecord(parsed);
  if (!record) {
    throw new OpenCodeConfigContentError(
      `${OPENCODE_CONFIG_CONTENT_ENV} in Stave's environment must be a JSON object. Stave did not start OpenCode, so that inline config was not replaced.`,
    );
  }
  return record;
}

/**
 * The `OPENCODE_CONFIG_CONTENT` value for a turn, merged over the inherited
 * value. OpenCode applies this inline config over the global and project
 * config files.
 *
 * - Manual and read-only define the turn's Stave agent (`agent`, from
 *   `resolveOpenCodeTurnAgent`) whole, and the turn selects it as the
 *   session mode.
 * - Auto keeps everything and appends ask rules for the Stave tools that
 *   answer another task to the `build` agent. New keys land after the user's
 *   keys in OpenCode's merge, so they are the last match for those tools.
 */
export function buildOpenCodeConfigContent(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
  /** The turn's agent, from `resolveOpenCodeTurnAgent`. */
  agent: string;
  existing?: string;
}): string {
  const base = args.existing?.trim() ? parseOpenCodeConfigContent(args.existing) : {};
  const agents = { ...(asRecord(base.agent) ?? {}) };
  const agentName = args.agent;
  const kind = resolveOpenCodeTurnAgentKind(args);
  const rules = buildOpenCodePermissionRules(args);
  if (rules) {
    if (agentName === OPENCODE_BUILD_AGENT) {
      throw new Error("A Manual or read-only OpenCode turn must run on a Stave agent.");
    }
    agents[agentName] = {
      mode: "primary",
      description:
        kind === "read-only"
          ? "Stave read-only turn: asks before every tool, file edits off."
          : "Stave Manual turn: asks before every tool.",
      permission: rules,
    };
  } else {
    const build = asRecord(agents[OPENCODE_BUILD_AGENT]) ?? {};
    const permission = asRecord(build.permission) ?? {};
    const guarded = Object.fromEntries(
      [...OPENCODE_LOCAL_MCP_DENIED_TOOLS]
        .sort()
        .map((tool) => [`${STAVE_LOCAL_MCP_TOOL_PREFIX}${tool}`, "ask"]),
    );
    const kept = Object.fromEntries(
      Object.entries(permission).filter(([key]) => !(key in guarded)),
    );
    agents[OPENCODE_BUILD_AGENT] = {
      ...build,
      permission: { ...kept, ...guarded },
    };
  }
  return JSON.stringify({ ...base, agent: agents });
}
