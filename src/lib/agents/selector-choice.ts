import { getDefaultModelForProvider } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { listAgents } from "./library";
import { AGENT_PERMISSIONS, isUsableAs, type AgentConfig, type AgentPermission } from "./schema";

/**
 * What the composer's selector does. It lists Models and Agents; the choice
 * decides whether the task is a Chat (a model runs it) or an Agent task (an
 * agent runs it and picks its own model).
 *
 * - A model in the Models section is Chat: the task's agent, if any, is
 *   released and the model runs the task as it always did.
 * - An agent in the Agents section is Agent mode: the agent is recorded, the
 *   picker is not moved to a model, and Stave Auto routes every turn from the
 *   agent's task class. An agent that declares a fixed model uses it instead.
 * - A model in the agent's pin segment pins the lead's turns to it. A pin
 *   never releases the agent. "Back to Auto" removes it.
 *
 * Precedence on every Agent-mode turn: pin > the agent's fixed model > Stave
 * Auto with the agent's task class. The draft carries all three: a model in
 * the draft is a pin or the agent's fixed model, Stave Auto without a model is
 * the third.
 */

/**
 * The agents a task can run as: active built-in and custom agents usable as a
 * main agent. Kickoff's Who and the composer offer the same list.
 */
export function selectableMainAgents(custom: readonly AgentConfig[]): AgentConfig[] {
  return listAgents({ custom, activeOnly: true }).filter((agent) => isUsableAs(agent, "primary"));
}

/** The agents whose name or description contains every word of the selector's search. */
export function matchAgents<T extends Pick<AgentConfig, "name" | "description">>(
  agents: readonly T[],
  query: string,
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...agents];
  return agents.filter((agent) => {
    const haystack = `${agent.name} ${agent.description}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
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
 * The composer asks before a switch between agents that widens what the task
 * may do.
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

/** The model an agent declares as its own; null when it leaves the model to Stave Auto. */
export interface FixedAgentModel {
  providerId: ProviderId;
  model?: string;
}

export function fixedModelOf(agent: Pick<AgentConfig, "model">): FixedAgentModel | null {
  if (agent.model.mode !== "fixed") return null;
  const { providerId, model } = agent.model;
  return model ? { providerId, model } : { providerId };
}

/** How an Agent-mode task's lead turns pick their model. */
export type AgentModelRoute = "auto" | "agent-fixed" | "pinned";

/**
 * The model an agent's fixed route runs on: its own model, else its
 * provider's default model. A provider-only agent runs on that one model, not
 * on any model of the provider.
 */
export function fixedAgentModelId(fixed: FixedAgentModel): string {
  return fixed.model ?? getDefaultModelForProvider({ providerId: fixed.providerId });
}

/**
 * The route the draft encodes for a task that runs as an agent: Stave Auto
 * without a model is `auto`; the model the agent's fixed route runs on
 * (`fixedAgentModelId`) is `agent-fixed`; any other model in the draft, even
 * one of the agent's provider, is a pin. The composer passes `fixed` with the
 * model it moved a provider-only agent to, when it offers one.
 */
export function resolveAgentModelRoute(args: {
  fixed: FixedAgentModel | null;
  /** The draft is on Stave Auto (and holds no model). */
  autoRouting: boolean;
  providerId: ProviderId;
  model: string;
}): AgentModelRoute {
  if (args.autoRouting) return "auto";
  const { fixed } = args;
  if (fixed && fixed.providerId === args.providerId && fixedAgentModelId(fixed) === args.model) {
    return "agent-fixed";
  }
  return "pinned";
}

export type SelectorChoice =
  | { kind: "model" }
  | { kind: "agent"; agent: AgentConfig }
  | { kind: "pin" }
  | { kind: "unpin" };

/** What happens to the task's agent assignment. `confirm` asks first, then records. */
export type SelectorAssignment = "keep" | "release" | "record" | "confirm";

/**
 * What the draft's model route becomes: the model that was picked, Stave Auto
 * (no model), the agent's fixed model, or whatever it is now.
 */
export type SelectorDraft = "picked" | "auto" | "agent-fixed" | "unchanged";

export interface SelectorPlan {
  assignment: SelectorAssignment;
  draft: SelectorDraft;
}

/**
 * The effect of one choice in the selector, as data. The composer applies the
 * assignment step (an IPC call), then the draft step.
 */
export function planSelectorChoice(args: {
  choice: SelectorChoice;
  /** The agent the task runs as now; null for a Chat task. */
  current: { agentConfigId: string; permission: AgentPermission } | null;
  /** The composer offers the agent's fixed model and may move to it. */
  fixedModelAvailable: boolean;
  /** Stave Auto is on, so the picker has an Auto option to route with. */
  autoAvailable: boolean;
}): SelectorPlan {
  const { choice, current } = args;
  const agentDefault: SelectorDraft = args.fixedModelAvailable ? "agent-fixed" : args.autoAvailable ? "auto" : "unchanged";
  switch (choice.kind) {
    case "model":
      return { assignment: current ? "release" : "keep", draft: "picked" };
    case "pin":
      return { assignment: "keep", draft: "picked" };
    case "unpin":
      return { assignment: "keep", draft: agentDefault };
    case "agent":
      // Choosing the agent that already runs the task is not a reset.
      if (current?.agentConfigId === choice.agent.id) return { assignment: "keep", draft: "unchanged" };
      return {
        assignment: current && switchWidensPermission({ from: current, to: choice.agent }) ? "confirm" : "record",
        draft: agentDefault,
      };
  }
}

/**
 * Whether the next send is the one that assigns the agent: the task runs as an
 * agent and none of its turns ran under that assignment yet. Later sends are
 * plain sends.
 */
export function awaitsFirstAgentTurn(args: {
  assignmentId: string | null | undefined;
  messages: readonly { agentProvenance?: { assignmentId: string } | undefined }[] | undefined;
}): boolean {
  if (!args.assignmentId) return false;
  const messages = args.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.agentProvenance?.assignmentId === args.assignmentId) return false;
  }
  return true;
}
