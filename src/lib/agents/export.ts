import type { AgentConfig } from "./schema";

/**
 * Writes an agent as a provider agent file, so the same role runs outside
 * Stave. Claude and Codex only: their file fields are documented and a
 * round-trip through `importAgentFile` is tested.
 *
 * What is written is the smallest faithful file. Nothing that would run code
 * or skip approvals is ever written: an Auto agent is exported without a
 * permission, so the file never grants more than the provider's default.
 * Stave-only fields (report sections, where it works, usable as, can call,
 * workflow, check-ins) are left out
 * and listed, the same way import lists what it drops.
 */

export const AGENT_EXPORT_FORMATS = ["claude-md", "codex-toml"] as const;
export type AgentExportFormat = (typeof AGENT_EXPORT_FORMATS)[number];

export const AGENT_EXPORT_FORMAT_LABELS: Readonly<Record<AgentExportFormat, string>> = {
  "claude-md": "Claude agent file",
  "codex-toml": "Codex agent file",
};

export interface AgentExport {
  path: string;
  content: string;
  /** Fields the file does not carry. */
  leftOut: string[];
}

const CLAUDE_PERMISSION = { "read-only": "plan", manual: "default", guided: "acceptEdits", auto: null } as const;

/** A file name from the agent id; ids are already slug-shaped, this only guards the path. */
function fileStem(agent: AgentConfig) {
  return agent.id.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "agent";
}

/** A JSON string is a valid TOML basic string. */
const quote = (value: string) => JSON.stringify(value);

/**
 * A YAML literal block keeps any text as written — quotes, colons, `#` — with
 * no escaping for a reader to get wrong.
 */
const yamlBlock = (key: string, value: string) =>
  [`${key}: |-`, ...value.split("\n").map((line) => (line ? `  ${line}` : ""))].join("\n");

function description(agent: AgentConfig) {
  return agent.avoidWhen ? `${agent.description} Don't use when: ${agent.avoidWhen}` : agent.description;
}

export function exportAgentFile(agent: AgentConfig, format: AgentExportFormat): AgentExport {
  const leftOut = [
    "report",
    "usableAs",
    ...(agent.canCall ? ["canCall"] : []),
    ...(agent.skills.length ? ["skills"] : []),
    ...(agent.workflow ? ["workflow"] : []),
    ...(agent.checkIns ? ["checkIns"] : []),
  ];
  const fixed = agent.model.mode === "fixed" ? agent.model : null;

  if (format === "claude-md") {
    // Claude names an agent by a lowercase identifier; the Stave id already is one.
    const lines = ["---", `name: ${fileStem(agent)}`, yamlBlock("description", description(agent))];
    if (agent.tools.allow?.length) lines.push(`tools: ${agent.tools.allow.join(", ")}`);
    if (agent.tools.deny?.length) lines.push(`disallowedTools: ${agent.tools.deny.join(", ")}`);
    if (fixed?.providerId === "claude-code" && fixed.model) lines.push(`model: ${fixed.model}`);
    else if (fixed) leftOut.push("model");
    if (fixed?.providerId === "claude-code" && fixed.effort) lines.push(`effort: ${fixed.effort}`);
    if (agent.tools.maxTurns) lines.push(`maxTurns: ${agent.tools.maxTurns}`);
    const mode = CLAUDE_PERMISSION[agent.permission];
    if (mode) lines.push(`permissionMode: ${mode}`);
    else leftOut.push("permission");
    if (agent.workspace === "new-worktree") lines.push("isolation: worktree");
    lines.push("---", "", agent.instructions.trim(), "");
    return { path: `.claude/agents/${fileStem(agent)}.md`, content: lines.join("\n"), leftOut };
  }

  // Codex has no tool list; a sandbox is the only limit it enforces.
  if (agent.tools.allow?.length || agent.tools.deny?.length) leftOut.push("tools");
  if (agent.tools.maxTurns) leftOut.push("maxTurns");
  if (agent.workspace === "new-worktree") leftOut.push("workspace");
  const lines = [
    `name = ${quote(agent.id)}`,
    `description = ${quote(description(agent))}`,
    `developer_instructions = ${quote(agent.instructions.trim())}`,
  ];
  if (fixed?.providerId === "codex" && fixed.model) lines.push(`model = ${quote(fixed.model)}`);
  else if (fixed) leftOut.push("model");
  if (fixed?.providerId === "codex" && fixed.effort) lines.push(`model_reasoning_effort = ${quote(fixed.effort)}`);
  if (agent.permission === "read-only") lines.push('sandbox_mode = "read-only"');
  else if (agent.permission !== "auto") lines.push('sandbox_mode = "workspace-write"');
  else leftOut.push("permission");
  return { path: `.codex/agents/${fileStem(agent)}.toml`, content: `${lines.join("\n")}\n`, leftOut };
}
