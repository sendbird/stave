/**
 * Learned suggestions: when you correct a custom agent in its task, Stave asks
 * the utility model once whether the agent's instructions should change so the
 * correction is not needed next time. The answer is only a suggestion; it is
 * applied (as a normal save, so it joins History), edited first, or dismissed
 * on the agent's page.
 *
 * Pure. The call itself lives in `src/store/agent-learning-runtime.ts`.
 */
import { extractJsonObject } from "@/lib/playbooks/draft-with-ai";
import { AGENT_CONFIG_LIMITS, type AgentConfig } from "./schema";

export interface AgentSuggestion {
  /** Stable id: one suggestion per task. */
  id: string;
  agentConfigId: string;
  /** The task whose correction produced it. */
  taskId: string;
  createdAt: string;
  /** One sentence naming what the agent should do differently. */
  summary: string;
  /** The full proposed instructions. */
  instructions: string;
  /** The instructions the suggestion was written against, to spot a stale one. */
  basedOn: string;
}

export type AgentSuggestionsMap = Record<string, AgentSuggestion[]>;

/** Open suggestions kept per agent; the oldest is dropped first. */
export const MAX_AGENT_SUGGESTIONS = 3;
const MAX_SUMMARY_CHARS = 280;
/** Transcript budget sent to the model, split between the task's messages. */
export const MAX_LEARNING_TRANSCRIPT_CHARS = 8_000;
const MAX_MESSAGE_CHARS = 1_500;

export interface LearningMessage {
  role: string;
  content: string;
}

/**
 * Whether a task's conversation contains a correction worth learning from: the
 * user wrote again after the agent's first answer. A task with only its
 * assignment and replies has nothing to learn.
 */
export function hasUserCorrection(messages: readonly LearningMessage[]): boolean {
  let answered = false;
  for (const message of messages) {
    if (!message.content.trim()) continue;
    if (message.role === "assistant") answered = true;
    else if (message.role === "user" && answered) return true;
  }
  return false;
}

/**
 * The conversation text the model sees: user and assistant prose only, each
 * message clipped, newest kept when over budget. Tool output, attachments and
 * runtime settings are never included.
 */
export function buildLearningTranscript(messages: readonly LearningMessage[]): string {
  const lines: string[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = message.content.trim();
    if (!text) continue;
    const clipped = text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text;
    const line = `${message.role === "user" ? "USER" : "AGENT"}: ${clipped}`;
    if (used + line.length > MAX_LEARNING_TRANSCRIPT_CHARS) break;
    lines.unshift(line);
    used += line.length;
  }
  return lines.join("\n\n");
}

export function buildLearningPrompt(args: { agent: AgentConfig; transcript: string }): string {
  return [
    "You improve the saved instructions of a coding agent. Below are its current instructions and a task",
    "conversation in which the user corrected the agent.",
    "",
    "Decide whether the correction reveals a lasting preference that belongs in the instructions (a rule the",
    "agent should follow on every future task), not a one-off detail of this task.",
    "",
    "Answer with a single JSON object and nothing else:",
    '{ "change": false }',
    "or",
    '{ "change": true, "summary": string (one sentence, what the agent should do differently),',
    '  "instructions": string (the full revised instructions: keep everything that still applies, add or edit',
    "  only what the correction requires, same voice and format) }",
    "",
    "Current instructions:",
    "<<<",
    args.agent.instructions,
    ">>>",
    "",
    "Conversation:",
    "<<<",
    args.transcript,
    ">>>",
  ].join("\n");
}

export type LearningResult =
  | { ok: true; suggestion: Pick<AgentSuggestion, "summary" | "instructions"> | null }
  | { ok: false; message: string };

/**
 * Reads the model's answer. `null` means no change is needed; so does an
 * answer whose instructions equal the current ones.
 */
export function parseLearningAnswer(text: string, current: string): LearningResult {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, message: "No JSON object in the answer." };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "The answer could not be read." };
  }
  if (raw.change !== true) return { ok: true, suggestion: null };
  const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, MAX_SUMMARY_CHARS) : "";
  const instructions =
    typeof raw.instructions === "string" ? raw.instructions.trim().slice(0, AGENT_CONFIG_LIMITS.instructions) : "";
  if (!summary || !instructions) return { ok: false, message: "The answer had no summary or instructions." };
  if (instructions === current.trim()) return { ok: true, suggestion: null };
  return { ok: true, suggestion: { summary, instructions } };
}

/** Adds a suggestion for its agent, replacing one from the same task and capping the list. */
export function addAgentSuggestion(map: AgentSuggestionsMap, suggestion: AgentSuggestion): AgentSuggestionsMap {
  const existing = (map[suggestion.agentConfigId] ?? []).filter((item) => item.taskId !== suggestion.taskId);
  return {
    ...map,
    [suggestion.agentConfigId]: [suggestion, ...existing].slice(0, MAX_AGENT_SUGGESTIONS),
  };
}

/** Removes one suggestion; drops the agent's key when it was the last. */
export function removeAgentSuggestion(map: AgentSuggestionsMap, agentConfigId: string, id: string): AgentSuggestionsMap {
  const remaining = (map[agentConfigId] ?? []).filter((item) => item.id !== id);
  const { [agentConfigId]: _removed, ...rest } = map;
  return remaining.length ? { ...rest, [agentConfigId]: remaining } : rest;
}

/** Drops every suggestion of an agent (used when it is deleted). */
export function dropAgentSuggestions(map: AgentSuggestionsMap, agentConfigId: string): AgentSuggestionsMap {
  if (!(agentConfigId in map)) return map;
  const { [agentConfigId]: _removed, ...rest } = map;
  return rest;
}

/** Whether a task already has a suggestion, so a later turn of the same task does not ask again. */
export function hasSuggestionForTask(map: AgentSuggestionsMap, agentConfigId: string, taskId: string): boolean {
  return (map[agentConfigId] ?? []).some((item) => item.taskId === taskId);
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : null;
}

/** Restores persisted suggestions, keeping only well-formed entries. */
export function normalizeAgentSuggestions(raw: unknown): AgentSuggestionsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: AgentSuggestionsMap = {};
  for (const [agentConfigId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const items: AgentSuggestion[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const value = entry as Record<string, unknown>;
      const id = text(value.id, 200);
      const taskId = text(value.taskId, 200);
      const createdAt = text(value.createdAt, 64);
      const summary = text(value.summary, MAX_SUMMARY_CHARS);
      const instructions = text(value.instructions, AGENT_CONFIG_LIMITS.instructions);
      const basedOn = typeof value.basedOn === "string" ? value.basedOn.slice(0, AGENT_CONFIG_LIMITS.instructions) : "";
      if (!id || !taskId || !createdAt || !summary || !instructions) continue;
      items.push({ id, agentConfigId, taskId, createdAt, summary, instructions, basedOn });
      if (items.length === MAX_AGENT_SUGGESTIONS) break;
    }
    if (items.length) result[agentConfigId] = items;
  }
  return result;
}

/** Agents whose learning is off. Learning is on by default for custom agents. */
export function normalizeLearningDisabled(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
