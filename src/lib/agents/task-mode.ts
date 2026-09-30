import { listAgents } from "./library";
import { AGENT_PERMISSIONS, isUsableAs, type AgentConfig, type AgentPermission } from "./schema";

/**
 * Whether the model picker offers agents.
 *
 * - `model` (default): the picker lists models; saved agents run through
 *   Kickoff, delegation and playbooks.
 * - `agentic` (experimental): the picker also has an Agents tab. Picking an
 *   agent runs the task as it from the next turn until changed; its model
 *   policy sets the model and a picked model overrides it. A task that runs as
 *   an agent has no Worker: the agent calls other agents itself.
 */
export const TASK_MODES = ["model", "agentic"] as const;
export type TaskMode = (typeof TASK_MODES)[number];
export const DEFAULT_TASK_MODE: TaskMode = "model";

export function normalizeTaskMode(value: unknown): TaskMode {
  return value === "agentic" ? "agentic" : DEFAULT_TASK_MODE;
}

/**
 * The agents a task can run as: active built-in and custom agents usable as a
 * main agent. Kickoff's Who and the agentic composer offer the same list.
 */
export function selectableMainAgents(custom: readonly AgentConfig[]): AgentConfig[] {
  return listAgents({ custom, activeOnly: true }).filter((agent) => isUsableAs(agent, "primary"));
}

/**
 * The permission a task runs under: its agent's, or `auto` (the task's own
 * settings) when it runs as the default agent.
 */
export function effectiveTaskPermission(agent: Pick<AgentConfig, "permission"> | null | undefined): AgentPermission {
  return agent?.permission ?? "auto";
}

/**
 * Whether moving a running task from one agent to another lets it do more.
 * The composer asks before a switch that widens what the task may do.
 */
export function switchWidensPermission(args: {
  from: Pick<AgentConfig, "permission"> | null | undefined;
  to: Pick<AgentConfig, "permission"> | null | undefined;
}): boolean {
  return (
    AGENT_PERMISSIONS.indexOf(effectiveTaskPermission(args.to)) >
    AGENT_PERMISSIONS.indexOf(effectiveTaskPermission(args.from))
  );
}

/**
 * What choosing an agent in the composer does. `null` stands for the default
 * agent (the task's own settings). Choosing the current agent again does
 * nothing; a choice that widens what the task may do is confirmed first.
 */
export function planComposerAgentChoice(args: {
  current: { agentConfigId: string; permission: AgentPermission } | null;
  next: AgentConfig | null;
}): "keep" | "confirm" | "apply" {
  if ((args.current?.agentConfigId ?? null) === (args.next?.id ?? null)) return "keep";
  return switchWidensPermission({ from: args.current, to: args.next }) ? "confirm" : "apply";
}
