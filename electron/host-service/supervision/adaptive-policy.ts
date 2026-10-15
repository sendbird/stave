import { currentProviderAccountId } from "../../provider-accounts/runtime-scope";
import { AdaptiveRunPolicySchema, TEAM_LIMITS, clampTeamLimit, type AdaptiveRunPolicy } from "../../../src/lib/agent-runs/resources";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import { getModelCapability, getSdkModelOptions, inferProviderIdFromModel, listCodexReasoningEffortsForModel } from "../../../src/lib/providers/model-catalog";
import { resolveAutoRoutingProfile, routeEffortOverrides } from "../../../src/lib/routing/auto-routing";
import { listEligibleRouteModels } from "../../../src/lib/providers/auto-routing-profile";
import { resolveApiConnectionModel } from "../../provider-accounts/gateway-runtime";
import type { AgentRouteSettings } from "../../../src/lib/routing/agent-run-route";
import type { PromptDraftRuntimeOverrides } from "../../../src/types/chat";
import type { ProviderAccountSelection } from "../../../src/lib/providers/provider-account-selection";

/**
 * The team limits every Agent run freezes when it starts. Capture intent once:
 * a later settings or composer edit cannot widen a Run.
 */
export function freezeAdaptivePolicy(args: {
  providerId: AdaptiveRunPolicy["providerId"]; model: string; agent: AgentConfig | null;
  draft?: PromptDraftRuntimeOverrides | null; settings: AgentRouteSettings | null; maxTurns: number;
  delegated?: boolean; effort?: string; modelPinned?: boolean; effortPinned?: boolean;
  /** The accounts selected when the Run was asked for; they win over the draft and the request scope. */
  accounts?: ProviderAccountSelection;
  exclusiveModels?: readonly string[];
}): AdaptiveRunPolicy {
  const { providerId, agent, draft } = args;
  const fixedModel = agent?.model.mode === "fixed" ? agent.model : null;
  if (fixedModel && fixedModel.providerId !== providerId) throw new Error("This Agent's fixed model runs on another provider. Switch the task to that provider before starting.");
  if (draft?.model && (draft.modelProviderId ?? inferProviderIdFromModel({ model: draft.model })) !== providerId) throw new Error("The model pinned in the composer runs on another provider. Switch the task to that provider before starting.");
  const requestedModel = (!args.delegated && draft?.model) || fixedModel?.model || args.model;
  const model = args.exclusiveModels === undefined ? requestedModel : resolveApiConnectionModel({ runtime: providerId, models: args.exclusiveModels, model: requestedModel });
  if (!model) throw new Error("Choose a model pinned on this API connection before starting.");
  const fixed = agent?.model.mode === "fixed";
  const modelLocked = fixed || args.modelPinned === true || (!args.delegated && Boolean(draft?.model || draft?.autoRouting === false));
  const requestedEffort = args.effort ?? (providerId === "codex" ? draft?.codexReasoningEffort : draft?.claudeEffort) ??
    fixedModel?.effort ??
    (providerId === "codex" ? getModelCapability({ model })?.defaultCodexReasoningEffort : getModelCapability({ model })?.defaultClaudeEffort);
  const effective = routeEffortOverrides({ providerId, model, effort: requestedEffort });
  const effortLocked = Boolean(args.effortPinned || fixedModel?.effort || (!args.delegated && (providerId === "codex" ? draft?.codexReasoningEffort : draft?.claudeEffort)));
  const initialEffort = effective.claudeEffort ?? effective.codexReasoningEffort ?? null;
  const supported = providerId !== "codex" || !initialEffort || listCodexReasoningEffortsForModel({ model }).some((value) => value === initialEffort);
  if (effortLocked && (requestedEffort !== initialEffort || !supported)) throw new Error("The pinned effort is not supported by this model. Choose a supported effort before starting.");
  if (!supported) throw new Error("The model does not support its starting effort. Choose a supported effort before starting.");
  // The routing profile's eligible models; empty means the whole catalog.
  const eligible = args.settings ? resolveAutoRoutingProfile(args.settings.routing).eligibleModelsByProvider[providerId] : undefined;
  const candidates = args.exclusiveModels !== undefined
    ? args.settings ? listEligibleRouteModels({ profile: resolveAutoRoutingProfile(args.settings.routing), providerId, exclusiveModels: args.exclusiveModels }) : args.exclusiveModels
    : eligible?.length ? eligible : getSdkModelOptions({ providerId });
  return AdaptiveRunPolicySchema.parse({ version: 2, profile: "balanced", providerId,
    accountProfileId: (providerId === "codex" ? args.accounts?.codexAccountProfileId ?? draft?.codexAccountProfileId : args.accounts?.claudeAccountProfileId ?? draft?.claudeAccountProfileId) ?? currentProviderAccountId(providerId),
    allowedModels: modelLocked ? [model] : [...new Set([model, ...candidates.filter((id) => args.exclusiveModels !== undefined || getModelCapability({ model: id })?.providerId === providerId)])],
    modelLocked, effortLocked, initialEffort,
    // The run's max turns are the whole team's: the parent and every helper.
    teamTurns: Math.min(args.maxTurns, TEAM_LIMITS.maxTeamTurns),
    concurrentHelpers: clampTeamLimit("concurrentHelpers", args.settings?.teamLimits?.concurrentHelpers),
    totalHelpers: clampTeamLimit("totalHelpers", args.settings?.teamLimits?.totalHelpers),
    parentReserve: 1, maxChanges: 2, cooldownTurns: 2 });
}
