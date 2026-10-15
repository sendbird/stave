import type { StreamTurnArgs } from "../types";
import { STAVE_LOCAL_MCP_NEVER_AUTO_APPROVED_TOOLS } from "../stave-local-mcp-approval";

type OpenCodeRuntimeOptions = NonNullable<StreamTurnArgs["runtimeOptions"]>;
type PermissionRules = Record<string, unknown>;

export const OPENCODE_CONFIG_CONTENT_ENV = "OPENCODE_CONFIG_CONTENT";
/** OpenCode's own primary agent; Auto turns run it with the user's rules. */
export const OPENCODE_BUILD_AGENT = "build";
/** Stave-defined agents. Names no user config is expected to define. */
export const OPENCODE_STAVE_MANUAL_AGENT = "stave-manual";
export const OPENCODE_STAVE_READ_ONLY_AGENT = "stave-read-only";
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

/**
 * The agent a turn runs as. Manual and read-only use an agent Stave defines,
 * so its permission object is Stave's alone: OpenCode merges config layers
 * key by key and keeps each key's first position, and evaluates rules last
 * match wins, so rules added to a built-in agent can be outranked by a
 * user's rule for the same key in a global or project file. An agent's rules
 * are evaluated after the global ones, so the Stave agent's rules decide.
 */
export function resolveOpenCodeTurnAgent(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
}) {
  if (args.denyEdits) return OPENCODE_STAVE_READ_ONLY_AGENT;
  return args.approvalMode === "auto" ? OPENCODE_BUILD_AGENT : OPENCODE_STAVE_MANUAL_AGENT;
}

/**
 * Tool families OpenCode 2.x runs without a permission check, so `ask` never
 * reaches them: the code-mode tools in the `opencode` namespace
 * (`worktree_create`, `session_move`, `session_rename`, ...) and the desktop
 * browser tools (permission name `browser`). OpenCode removes a tool from the
 * session only when the agent's last matching rule for it is a wildcard
 * `deny`. OpenCode 1.x has neither family and ignores the keys.
 */
const OPENCODE_UNGATED_TOOL_DENIES = Object.freeze({
  "opencode_*": "deny",
  browser: "deny",
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
  const agent = resolveOpenCodeTurnAgent(args);
  if (agent === OPENCODE_STAVE_READ_ONLY_AGENT) {
    return { "*": "ask", edit: "deny", task: "deny", ...OPENCODE_UNGATED_TOOL_DENIES };
  }
  if (agent === OPENCODE_STAVE_MANUAL_AGENT) {
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
  } catch (error) {
    throw new OpenCodeConfigContentError(
      `${OPENCODE_CONFIG_CONTENT_ENV} in Stave's environment is not valid JSON or JSONC (${error instanceof Error ? error.message : String(error)}). Stave did not start OpenCode, so that inline config was not replaced. Fix or unset it and send again.`,
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
 * - Manual and read-only define the Stave agent whole, replacing any inline
 *   definition of the same name, and the turn selects it as the session mode.
 * - Auto keeps everything and appends ask rules for the Stave tools that
 *   answer another task to the `build` agent. New keys land after the user's
 *   keys in OpenCode's merge, so they are the last match for those tools.
 */
export function buildOpenCodeConfigContent(args: {
  approvalMode?: OpenCodeRuntimeOptions["opencodeApprovalMode"];
  denyEdits?: boolean;
  existing?: string;
}): string {
  const base = args.existing?.trim() ? parseOpenCodeConfigContent(args.existing) : {};
  const agents = { ...(asRecord(base.agent) ?? {}) };
  const agentName = resolveOpenCodeTurnAgent(args);
  const rules = buildOpenCodePermissionRules(args);
  if (rules) {
    agents[agentName] = {
      mode: "primary",
      description:
        agentName === OPENCODE_STAVE_READ_ONLY_AGENT
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
