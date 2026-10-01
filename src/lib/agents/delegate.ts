import type { DelegateTaskArgs } from "@/lib/runs/delegated-task";
import { compileAgent, snapshotAgent, type AgentSnapshot } from "./compile";
import type { AgentConfig, AgentPermission } from "./schema";

/**
 * Delegating to an agent (`DelegateTaskArgs.agentConfigId`): the agent's
 * compiled delegate options are applied to the request before the coordinator
 * sees it, so the ledger, identity and retry rules stay exactly as they are.
 *
 * Refused, never silently changed, when:
 * - an allowed-agents list applies (a project's Agents) and the agent is not on it;
 * - the delegating task's own agent lists who it can call and the agent is not on it;
 * - the agent cannot be a delegated task on the requested provider;
 * - no host delegation authority is supplied and the direct permission ceiling would be widened.
 *
 * Otherwise the narrower of the request and the agent wins: the permission
 * profile, and the agent's instructions go ahead of the prompt.
 */

type Profile = "auto" | "guided" | "manual";
const PROFILE_RANK: Readonly<Record<Profile, number>> = {
  manual: 0,
  guided: 1,
  auto: 2,
};

/** The widest delegated profile a task running as an agent may hand out. */
export function delegateCeiling(permission: AgentPermission): Profile {
  return permission === "read-only" ? "manual" : permission;
}

function narrower(a: Profile, b: Profile): Profile {
  return PROFILE_RANK[a] <= PROFILE_RANK[b] ? a : b;
}

export type AgentDelegationResult =
  | { ok: true; args: DelegateTaskArgs; snapshot: AgentSnapshot }
  | {
      ok: false;
      code: "not-allowed" | "not-a-delegate" | "widens-permission";
      message: string;
    };

export function applyAgentToDelegation(input: {
  args: DelegateTaskArgs;
  agent: AgentConfig;
  /** Direct permission fallback when the caller supplies no host Can call authority. */
  parentPermission?: AgentPermission | null;
  /** When set, only these agents may be delegated to. */
  allowedAgentIds?: readonly string[] | null;
  /** The delegating task's own agent's "Can call"; null or absent allows any agent. */
  parentCanCall?: readonly string[] | null;
  /** The user's standards, added after the agent's instructions. */
  standards?: string;
}): AgentDelegationResult {
  const { args, agent } = input;
  if (input.allowedAgentIds && !input.allowedAgentIds.includes(agent.id)) {
    return {
      ok: false,
      code: "not-allowed",
      message: `"${agent.name}" is not one of this project's agents.`,
    };
  }
  if (input.parentCanCall && !input.parentCanCall.includes(agent.id)) {
    return {
      ok: false,
      code: "not-allowed",
      message: input.parentCanCall.length
        ? `This task's agent cannot call "${agent.name}". It can call: ${input.parentCanCall.join(", ")}.`
        : "This task's agent does not call other agents.",
    };
  }
  const snapshot = snapshotAgent(agent);
  const compiled = compileAgent({
    snapshot,
    role: "delegate",
    providerId: args.providerId,
    ...(input.standards ? { standards: input.standards } : {}),
  });
  if (!compiled.ok)
    return { ok: false, code: "not-a-delegate", message: compiled.message };
  if (compiled.compiled.role !== "delegate") {
    return {
      ok: false,
      code: "not-a-delegate",
      message: `"${agent.name}" did not compile as a delegated task.`,
    };
  }
  const delegate = compiled.compiled;
  const profile = narrower(
    args.permissionProfile === undefined || args.permissionProfile === "inherit"
      ? "auto"
      : args.permissionProfile,
    delegate.delegate.permissionProfile === "manual"
      ? "manual"
      : delegate.delegate.permissionProfile === "guided"
        ? "guided"
        : "auto",
  );
  if (
    input.parentCanCall === undefined &&
    input.parentPermission &&
    PROFILE_RANK[profile] >
      PROFILE_RANK[delegateCeiling(input.parentPermission)]
  ) {
    return {
      ok: false,
      code: "widens-permission",
      message: `This task runs within ${input.parentPermission}; "${agent.name}" would run with ${profile}. Ask for a narrower profile.`,
    };
  }
  const fixedModel = delegate.delegate.model;
  return {
    ok: true,
    snapshot,
    args: {
      ...args,
      permissionProfile: profile,
      // A model the agent fixes wins, as it does when assigning.
      ...(fixedModel ? { model: fixedModel } : {}),
      ...(fixedModel && delegate.delegate.effort
        ? { effort: delegate.delegate.effort }
        : {}),
      title: args.title ?? agent.name,
      prompt: `${delegate.promptPreamble}\n\n---\n\n${args.prompt}`,
    },
  };
}
