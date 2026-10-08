import type { ProviderId } from "@/lib/providers/provider.types";
import { compileAgent, snapshotAgent } from "./compile";
import { isUsableAs, type AgentConfig } from "./schema";

/**
 * In-turn subagents: the agents a task's own agent may call inside its turn,
 * compiled from the agent's `canCall` list (any agent usable as a subagent
 * when the list is absent). Claude registers them as `agents`; Codex starts
 * them with `spawn_agent` from the briefing below. Either way they run under
 * the lead turn's permissions, one level deep, and their answers come back
 * into the turn. Durable subagents (another provider, their own worktree,
 * surviving a restart) are `stave_delegate_task`'s job instead.
 */
export interface NativeSubagentDefinition {
  /** The name the lead calls it by: the agent id. */
  name: string;
  label: string;
  description: string;
  instructions: string;
  model?: string;
  effort?: string;
  tools?: string[];
  maxTurns?: number;
}

/** At most this many callable agents are compiled into one turn. */
export const MAX_NATIVE_SUBAGENTS = 8;
/** At most this many in-turn subagents run at once. */
export const MAX_CONCURRENT_NATIVE_SUBAGENTS = 4;
const BRIEFING_INSTRUCTIONS_MAX_CHARS = 2_000;

export function compileNativeSubagents(args: {
  lead: AgentConfig;
  library: readonly AgentConfig[];
  providerId: ProviderId;
  standards?: string | null;
}): NativeSubagentDefinition[] {
  const allowed = args.lead.canCall ? new Set(args.lead.canCall) : null;
  const definitions: NativeSubagentDefinition[] = [];
  for (const agent of args.library) {
    if (definitions.length >= MAX_NATIVE_SUBAGENTS) break;
    if (agent.archived || agent.id === args.lead.id || !isUsableAs(agent, "worker")) continue;
    if (allowed && !allowed.has(agent.id)) continue;
    const compiled = compileAgent({
      snapshot: snapshotAgent(agent), role: "worker", providerId: args.providerId,
      ...(args.standards ? { standards: args.standards } : {}),
    });
    if (!compiled.ok || compiled.compiled.role !== "worker") continue;
    definitions.push(compiled.compiled.subagent);
  }
  return definitions;
}

function bounded(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * What the lead reads about its subagents when the provider has no native
 * definitions (Codex): who each one is, and the instructions to hand over at
 * the top of its task, along with the configured model and reasoning effort when supported.
 */
export function buildNativeSubagentBriefing(definitions: readonly NativeSubagentDefinition[]): string | null {
  if (definitions.length === 0) return null;
  return [
    "## Subagents",
    `You may start these subagents with \`spawn_agent\` for a bounded part of your task, at most ${MAX_CONCURRENT_NATIVE_SUBAGENTS} at once. Begin each subagent's message with its instructions below, then the task. Their answers come back to you; review them before you rely on them.`,
    ...definitions.map((definition) =>
      [
        `### ${definition.label} (\`${definition.name}\`)`,
        definition.description,
        ...(definition.model ? [`Model: ${definition.model}. Pass this model when spawning; do not silently replace a fixed model.`] : []),
        ...(definition.effort ? [`Reasoning effort: ${definition.effort}. Pass this effort when the selected model supports it.`] : []),
        "Instructions:",
        bounded(definition.instructions, BRIEFING_INSTRUCTIONS_MAX_CHARS),
      ].join("\n"),
    ),
  ].join("\n\n");
}
