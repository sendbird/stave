import { i18n } from "@/i18n/runtime";
/**
 * Describe to create: one line about what an agent should do becomes an
 * editable custom agent. The model answers with JSON; this module builds the
 * prompt and turns the answer into an agent the schema accepts. The result is
 * always an unsaved draft the user reviews in the editor.
 *
 * The reply style every built-in agent shares is added to the instructions, so
 * a drafted agent writes back the same way. Pure. The call itself lives in `src/store/agent-draft-runtime.ts`.
 */
import { TASK_CLASSES } from "@/lib/providers/auto-routing-profile";
import { blankCustomAgent } from "./library";
import { SHARED_STYLE } from "./starters";
import {
  AGENT_COLORS,
  AGENT_CONFIG_LIMITS,
  AGENT_PERMISSIONS,
  AGENT_WORKSPACES,
  AgentConfigSchema,
  type AgentConfig,
} from "./schema";

/** The outermost JSON object in a model answer, tolerating a code fence. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start === -1 || end <= start ? null : text.slice(start, end + 1);
}

export const MAX_AGENT_DESCRIPTION_CHARS = 2_000;

export function buildAgentDraftPrompt(description: string): string {
  return [
    "You write saved agents for a coding assistant. An agent is a reusable worker: a name, when to use it,",
    "and the instructions it follows on every task it is given.",
    "",
    "Turn the user's description below into one agent. Answer with a single JSON object and nothing else:",
    "{",
    '  "name": string (1-3 words, a role such as "Docs writer"),',
    '  "useWhen": string (one sentence starting with "Use when" or "Use for"),',
    '  "instructions": string (5-15 short lines: how it works, what it checks before it reports, what it never does),',
    `  "permission": ${AGENT_PERMISSIONS.map((value) => `"${value}"`).join(" | ")},`,
    `  "workspace": ${AGENT_WORKSPACES.map((value) => `"${value}"`).join(" | ")},`,
    `  "color": ${AGENT_COLORS.map((value) => `"${value}"`).join(" | ")},`,
    `  "taskClass": ${TASK_CLASSES.map((value) => `"${value}"`).join(" | ")} (the kind of work, which picks the model)`,
    "}",
    "",
    "Rules:",
    '- Write instructions in the second person ("You …"), imperative, specific to the described job.',
    '- Use "read-only" and "same-workspace" only when the agent must never change files (reviewers, researchers).',
    '  Otherwise prefer "auto" and "new-worktree".',
    "- Do not invent tools, credentials or services the description does not mention.",
    "",
    "Description:",
    "<<<",
    description.trim().slice(0, MAX_AGENT_DESCRIPTION_CHARS),
    ">>>",
  ].join("\n");
}

function asText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function pick<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return values.find((candidate) => candidate === value);
}

/** Adds the shared reply style once, within the instruction limit. */
function withSharedStyle(instructions: string): string {
  if (instructions.includes(SHARED_STYLE)) return instructions;
  const room = AGENT_CONFIG_LIMITS.instructions - SHARED_STYLE.length - 2;
  return `${instructions.slice(0, Math.max(0, room)).trimEnd()}\n\n${SHARED_STYLE}`;
}

export type AgentDraftResult = { ok: true; agent: AgentConfig } | { ok: false; message: string };

/**
 * Turns the model's answer into a custom agent draft. Starts from the blank
 * agent so every field the answer leaves out keeps the usual default, then
 * repairs a read-only agent that asked for a new worktree (the schema refuses
 * that pair) instead of refusing the whole draft.
 */
export function parseAgentDraft(text: string, takenIds: Iterable<string>): AgentDraftResult {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, message: i18n.t("agents:draftWithAi.message") };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ok: false, message: i18n.t("agents:draftWithAi.message2") };
  }
  const name = asText(raw.name, AGENT_CONFIG_LIMITS.name);
  const instructions = asText(raw.instructions, AGENT_CONFIG_LIMITS.instructions);
  if (!name || !instructions) {
    return { ok: false, message: i18n.t("agents:draftWithAi.message3") };
  }
  const base = blankCustomAgent({ name, takenIds });
  const permission = pick(AGENT_PERMISSIONS, raw.permission) ?? base.permission;
  const workspace = permission === "read-only" ? "same-workspace" : (pick(AGENT_WORKSPACES, raw.workspace) ?? base.workspace);
  const color = pick(AGENT_COLORS, raw.color);
  const taskClass = pick(TASK_CLASSES, raw.taskClass);
  const candidate: AgentConfig = {
    ...base,
    description: asText(raw.useWhen, AGENT_CONFIG_LIMITS.description) || base.description,
    instructions: withSharedStyle(instructions),
    model: taskClass ? { mode: "auto", taskClass } : base.model,
    permission,
    workspace,
    ...(permission === "read-only" ? { report: ["summary", "findings", "limitations"] as AgentConfig["report"] } : {}),
    ...(color ? { appearance: { color } } : {}),
  };
  const parsed = AgentConfigSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, agent: parsed.data }
    : { ok: false, message: i18n.t("agents:draftWithAi.message4") };
}
