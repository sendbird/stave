import type { AgentModel } from "@/lib/agents/schema";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Which provider a delegated task runs on, decided before the agent is
 * applied so a saved agent's fixed or preferred provider is honoured instead
 * of being dropped when it differs from the parent's.
 *
 * In order: an explicit `provider` on the request wins, except that it cannot
 * contradict a Fixed agent (that is refused, not silently changed); a Fixed
 * agent runs on its own provider; an Auto agent's preference names one, or
 * `alternate-provider` for the one the parent is not on; then the Provider
 * strengths table's choice for the agent's task class, when strengths are on;
 * otherwise the parent's provider. Pure, so every branch is tested in
 * isolation.
 *
 * A preference or a strength is not a pin: when the provider it names cannot
 * run a delegated task here (its CLI is not installed), the delegation stays on the parent's provider
 * (`fallBackToParentProvider`). An explicit or Fixed provider is never
 * swapped, so its own failure reaches the caller.
 *
 * Messages are tool errors read by the model, not UI copy.
 */

export type DelegationProviderId = "claude-code" | "codex";

export type DelegationProviderSource = "explicit" | "agent-fixed" | "agent-preferred" | "strengths" | "parent";

export type DelegationProviderResolution =
  | {
      ok: true;
      providerId: DelegationProviderId;
      source: DelegationProviderSource;
      /** The preferred provider the delegation fell back from, when it could not run. */
      unavailableProviderId?: DelegationProviderId;
    }
  | { ok: false; code: "provider-conflict" | "provider-unknown"; message: string };

const DELEGATION_PROVIDERS: readonly DelegationProviderId[] = ["claude-code", "codex"];

function isDelegationProvider(value: string | null | undefined): value is DelegationProviderId {
  return DELEGATION_PROVIDERS.includes(value as DelegationProviderId);
}

function alternateOf(providerId: DelegationProviderId): DelegationProviderId {
  return providerId === "claude-code" ? "codex" : "claude-code";
}

// i18n-ignore: model-facing tool errors, not display copy
const MESSAGES = {
  conflict: (agent: string, fixed: ProviderId, explicit: DelegationProviderId) =>
    `Agent ${agent} is fixed to ${fixed}, so it cannot run on ${explicit}. Drop \`provider\` or choose another agent.`,
  fixedUnavailable: (agent: string, fixed: ProviderId) =>
    `Agent ${agent} is fixed to ${fixed}, which does not run delegated tasks (${DELEGATION_PROVIDERS.join(" or ")}). Choose another agent.`,
  alternateUnknown: (agent: string) =>
    `Name a provider: agent ${agent} prefers the other provider than this task's, and this task's provider could not be determined.`,
  parentUnknown: "Name a provider: this task's provider could not be determined.",
} as const;

export function resolveDelegationProvider(args: {
  /** `provider` as the request named it. */
  explicit?: DelegationProviderId;
  /** The saved agent's model choice; absent for a model-only delegation. */
  agentModel?: AgentModel | null;
  /** Used in messages only. */
  agentConfigId?: string;
  /** The delegating task's provider when known. */
  parentProviderId?: ProviderId | null;
  /** The Provider strengths choice for the agent's task class; absent when strengths are off. */
  strengthProviderId?: DelegationProviderId | null;
}): DelegationProviderResolution {
  const { explicit, agentModel } = args;
  const agent = args.agentConfigId ? `"${args.agentConfigId}"` : "(unnamed)";

  if (agentModel?.mode === "fixed") {
    if (explicit && explicit !== agentModel.providerId) {
      return { ok: false, code: "provider-conflict", message: MESSAGES.conflict(agent, agentModel.providerId, explicit) };
    }
    if (!isDelegationProvider(agentModel.providerId)) {
      return { ok: false, code: "provider-unknown", message: MESSAGES.fixedUnavailable(agent, agentModel.providerId) };
    }
    return { ok: true, providerId: agentModel.providerId, source: explicit ? "explicit" : "agent-fixed" };
  }

  if (explicit) {
    return { ok: true, providerId: explicit, source: "explicit" };
  }

  const preferred = agentModel?.mode === "auto" ? agentModel.preferredProvider : undefined;
  if (preferred === "alternate-provider") {
    if (!isDelegationProvider(args.parentProviderId)) {
      return { ok: false, code: "provider-unknown", message: MESSAGES.alternateUnknown(agent) };
    }
    return { ok: true, providerId: alternateOf(args.parentProviderId), source: "agent-preferred" };
  }
  if (preferred) {
    return { ok: true, providerId: preferred, source: "agent-preferred" };
  }
  if (args.strengthProviderId) {
    return { ok: true, providerId: args.strengthProviderId, source: "strengths" };
  }

  if (isDelegationProvider(args.parentProviderId)) {
    return { ok: true, providerId: args.parentProviderId, source: "parent" };
  }
  return { ok: false, code: "provider-unknown", message: MESSAGES.parentUnknown };
}

/**
 * True when the resolved provider is only a preference (the agent's or the
 * strengths table's) that differs from the parent's, so it is worth checking
 * that it can run before the child is created.
 */
export function shouldCheckDelegationProvider(
  resolution: DelegationProviderResolution,
  parentProviderId: ProviderId | null | undefined,
): boolean {
  return (
    resolution.ok &&
    (resolution.source === "agent-preferred" || resolution.source === "strengths") &&
    isDelegationProvider(parentProviderId) &&
    resolution.providerId !== parentProviderId
  );
}

/** The parent's provider in place of a preferred one that cannot run. */
export function fallBackToParentProvider(
  resolution: DelegationProviderResolution,
  parentProviderId: ProviderId | null | undefined,
): DelegationProviderResolution {
  if (!resolution.ok || !isDelegationProvider(parentProviderId)) return resolution;
  return { ok: true, providerId: parentProviderId, source: "parent", unavailableProviderId: resolution.providerId };
}
